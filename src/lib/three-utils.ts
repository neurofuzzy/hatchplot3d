import * as THREE from 'three';
import type { HatchPath, SceneLight, SceneObject } from '@/types';

/**
 * Generates hatch lines based on scene objects, lights, and camera.
 *
 * !!! IMPORTANT DEVELOPMENT NOTE !!!
 * This function is currently a PLACEHOLDER. It demonstrates the concept of
 * generating lines based on light properties (intensity for density, hatchAngle for orientation)
 * but it DOES NOT perform:
 *   - Actual projection of light onto 3D object surfaces.
 *   - Raycasting or intersection tests to determine where lines should appear on objects.
 *   - Shadow calculations (lines are generated regardless of object occlusion).
 *   - Consideration of object material properties.
 *
 * The lines are generated on an arbitrary plane oriented by the light,
 * which will make them appear "floating" and not attached to the objects.
 * A full implementation of a 3D hatching algorithm with shadows is complex
 * and would require significant geometric computations, typically involving:
 *   1. Identifying surfaces lit by each light.
 *   2. For lit surfaces, determining hatch line placement based on surface normal,
 *      light direction, and hatch parameters.
 *   3. Handling object self-shadowing and shadows cast by other objects.
 *   4. Projecting these 3D hatch lines to the 2D view plane.
 *
 * This placeholder is primarily for visualizing the light's influence directionally
 * and testing the data flow and SVG export mechanisms.
 */
export function generateHatchLines(
  objects: SceneObject[], // Currently unused in this placeholder beyond checking if objects exist
  lights: SceneLight[],
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera // Currently unused in this placeholder
): HatchPath[] {
  const hatchLines: HatchPath[] = [];

  if (objects.length === 0) {
    return []; // No objects, no hatches
  }

  lights.forEach((light) => {
    if (light.type === 'directional') {
      const numLines = Math.floor(light.intensity * 20); // Intensity maps to line density
      const angleRad = THREE.MathUtils.degToRad(light.hatchAngle);
      const spacing = 0.2; // Spacing between lines
      const lineLength = 5; // Length of individual hatch lines

      // Create a transformation matrix for the light
      const lightPosition = new THREE.Vector3(light.position.x, light.position.y, light.position.z);
      const lightTarget = new THREE.Vector3(light.target.x, light.target.y, light.target.z);
      
      // Create a matrix that orients things to align with the light's direction,
      // and positions them at the scene origin (or object centroid in a real impl).
      const orientationMatrix = new THREE.Matrix4();
      orientationMatrix.lookAt(lightPosition, lightTarget, new THREE.Vector3(0, 1, 0)); // Light looks from its pos to target
      // We want lines on a plane perpendicular to light direction, so we invert this for the plane.
      // Or, more simply, construct lines and then apply a rotation that matches light direction.

      const lightDirection = new THREE.Vector3().subVectors(lightTarget, lightPosition).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), lightDirection);


      for (let i = 0; i < numLines; i++) {
        const offset = (i - numLines / 2) * spacing;
        
        // Define lines in XY plane (as if this plane is perpendicular to an initial Z-axis light)
        // These lines are then rotated by hatchAngle around Z, then by light's overall orientation.
        const start = new THREE.Vector3(-lineLength / 2, offset, 0);
        const end = new THREE.Vector3(lineLength / 2, offset, 0);
        
        // Apply hatch angle rotation (around the local Z axis of the hatch plane)
        const hatchRotationMatrix = new THREE.Matrix4().makeRotationZ(angleRad);
        start.applyMatrix4(hatchRotationMatrix);
        end.applyMatrix4(hatchRotationMatrix);

        // Apply light's overall orientation
        // This makes the plane of hatches perpendicular to the light direction
        start.applyQuaternion(quaternion);
        end.applyQuaternion(quaternion);
        
        // For this placeholder, we position these hatches at the world origin.
        // In a real system, they'd be on object surfaces.
        // start.add(objectCentroid); // Example if we had an objectCentroid
        // end.add(objectCentroid);

        hatchLines.push([{ 
          start: { x: start.x, y: start.y, z: start.z }, 
          end: { x: end.x, y: end.y, z: end.z }
        }]);
      }
    }
  });

  return hatchLines;
}

export function exportToSVG(hatchPaths: HatchPath[], camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, sceneWidth: number, sceneHeight: number): string {
  let svgString = `<svg width="${sceneWidth}" height="${sceneHeight}" xmlns="http://www.w3.org/2000/svg" style="background-color: hsl(var(--background));">\n`;
  // SVG group to move origin to center and flip Y axis (Y points up)
  svgString += `<g transform="translate(${sceneWidth / 2}, ${sceneHeight / 2}) scale(1, -1)">\n`;

  // Ensure camera matrices are up to date for projection
  camera.updateMatrixWorld(); // Important for camera.matrixWorldInverse
  // camera.updateProjectionMatrix(); // Should be done if fov, aspect, near, far changed since construction

  const projectionMatrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  hatchPaths.forEach(path => {
    if (path.length > 0) {
      const points: string[] = [];
      path.forEach((segment, segmentIndex) => {
        const start3D = new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z);
        const end3D = new THREE.Vector3(segment.end.x, segment.end.y, segment.end.z);

        const start2D = projectToScreen(start3D, projectionMatrix, sceneWidth, sceneHeight);
        const end2D = projectToScreen(end3D, projectionMatrix, sceneWidth, sceneHeight);
        
        if (segmentIndex === 0) { // Start of a new polyline
            points.push(`${start2D.x},${start2D.y}`);
        }
        points.push(`${end2D.x},${end2D.y}`);
      });
      
      // Use a stroke color that contrasts with the background (foreground color)
      svgString += `  <polyline points="${points.join(' ')}" stroke="hsl(var(--foreground))" stroke-width="1" fill="none" />\n`;
    }
  });

  svgString += `</g>\n</svg>`;
  return svgString;
}


function projectToScreen(vector3: THREE.Vector3, projectionMatrix: THREE.Matrix4, width: number, height: number): { x: number, y: number } {
    const projected = vector3.clone().applyMatrix4(projectionMatrix);
    // Convert from Normalized Device Coordinates (NDC) to screen coordinates for SVG
    // NDC x, y range from -1 to 1.
    // The SVG <g> transform handles origin shift and Y inversion.
    // So we just need to scale NDC to half-width/height.
    const x = projected.x * (width / 2);
    const y = projected.y * (height / 2);
    return { x, y };
}

export function createObjectMeshes(objects: SceneObject[]): THREE.Mesh[] {
  return objects.map(obj => {
    let geometry: THREE.BufferGeometry;
    const material = new THREE.MeshStandardMaterial({ color: obj.color, side: THREE.DoubleSide });

    switch (obj.type) {
      case 'box':
        geometry = new THREE.BoxGeometry(
          obj.geometryParams.width || 1,
          obj.geometryParams.height || 1,
          obj.geometryParams.depth || 1
        );
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(
          obj.geometryParams.radius || 0.5,
          obj.geometryParams.widthSegments || 32,
          obj.geometryParams.heightSegments || 16
        );
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1); // Fallback
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
    mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
    mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
    mesh.userData = { id: obj.id }; // Store ID for later reference
    return mesh;
  });
}

export function createLightSources(lights: SceneLight[]): Array<{light: THREE.Light, helper?: THREE.LightHelper}> {
  return lights.map(lightData => {
    let light: THREE.Light;
    let helper: THREE.LightHelper | undefined = undefined;

    switch (lightData.type) {
      case 'directional':
        const dirLight = new THREE.DirectionalLight(lightData.color, lightData.intensity);
        dirLight.position.set(lightData.position.x, lightData.position.y, lightData.position.z);
        // The target is a separate Object3D internally. Set its position.
        dirLight.target.position.set(lightData.target.x, lightData.target.y, lightData.target.z);
        // It's good practice to add the target to the scene if you want transformations to apply correctly for helpers,
        // but DirectionalLightHelper usually works by reading target.position directly.
        light = dirLight;
        helper = new THREE.DirectionalLightHelper(dirLight, 1, new THREE.Color(lightData.color)); // Size 1 for the helper plane
        break;
      // Add other light types (spotlight, pointlight) here if needed
      default:
        // Fallback or for non-visualizable lights like AmbientLight
        const ambient = new THREE.AmbientLight(0xffffff, 0.2); 
        light = ambient;
    }
    light.userData = { id: lightData.id, hatchAngle: lightData.hatchAngle }; // Store ID and hatch angle
    return {light, helper};
  });
}
