import * as THREE from 'three';
import type { HatchPath, SceneLight, SceneObject } from '@/types';

// This is a placeholder for the actual hatching algorithm.
// It will be complex and involve geometric computations.
export function generateHatchLines(
  objects: SceneObject[],
  lights: SceneLight[],
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
): HatchPath[] {
  const hatchLines: HatchPath[] = [];

  // Simplified example: For each light, draw some lines on a plane.
  // This does NOT implement the described algorithm.
  lights.forEach((light, lightIndex) => {
    if (light.type === 'directional') {
      const numLines = Math.floor(light.intensity * 20); // Intensity maps to line density
      const angleRad = THREE.MathUtils.degToRad(light.hatchAngle);
      const spacing = 0.2;

      for (let i = 0; i < numLines; i++) {
        const offset = (i - numLines / 2) * spacing;
        
        // Create a line in XY plane, then rotate and translate based on light
        const start = new THREE.Vector3(-5, offset, 0);
        const end = new THREE.Vector3(5, offset, 0);
        
        // Apply light's hatch angle rotation (around Z axis of the light's local space)
        const rotationMatrix = new THREE.Matrix4().makeRotationZ(angleRad);
        start.applyMatrix4(rotationMatrix);
        end.applyMatrix4(rotationMatrix);

        // Create a quaternion for the light's direction
        const lightDirection = new THREE.Vector3().subVectors(
          new THREE.Vector3(light.target.x, light.target.y, light.target.z),
          new THREE.Vector3(light.position.x, light.position.y, light.position.z)
        ).normalize();
        
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1), lightDirection);

        // Apply light's orientation
        start.applyQuaternion(quaternion);
        end.applyQuaternion(quaternion);

        // Translate lines to an arbitrary plane in front of the light
        const lightPos = new THREE.Vector3(light.position.x, light.position.y, light.position.z);
        const translation = lightPos.clone().add(lightDirection.clone().multiplyScalar(5)); // Project 5 units along direction

        start.add(translation);
        end.add(translation);
        
        // This is where the actual projection and intersection logic would go.
        // For now, we just add these transformed lines directly.
        // This will not create shadows or conform to object surfaces correctly.
        hatchLines.push([{ 
          start: { x: start.x, y: start.y, z: start.z }, 
          end: { x: end.x, y: end.y, z: end.z }
        }]);
      }
    }
  });

  return hatchLines;
}

export function exportToSVG(hatchPaths: HatchPath[], camera: THREE.PerspectiveCamera, sceneWidth: number, sceneHeight: number): string {
  let svgString = `<svg width="${sceneWidth}" height="${sceneHeight}" xmlns="http://www.w3.org/2000/svg" style="background-color: #333333;">\n`;
  svgString += `<g transform="translate(${sceneWidth / 2}, ${sceneHeight / 2}) scale(1, -1)">\n`; // Y-axis inversion for typical SVG

  camera.updateMatrixWorld();
  const projectionMatrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  hatchPaths.forEach(path => {
    if (path.length > 0) {
      const points: string[] = [];
      path.forEach(segment => {
        const start3D = new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z);
        const end3D = new THREE.Vector3(segment.end.x, segment.end.y, segment.end.z);

        const start2D = projectToScreen(start3D, projectionMatrix, sceneWidth, sceneHeight);
        const end2D = projectToScreen(end3D, projectionMatrix, sceneWidth, sceneHeight);
        
        // Add points to the current path segment.
        // For a continuous path, only add the start point for the first segment.
        if(points.length === 0) {
            points.push(`${start2D.x},${start2D.y}`);
        }
        points.push(`${end2D.x},${end2D.y}`);
      });
      
      svgString += `  <polyline points="${points.join(' ')}" stroke="#FFFFFF" stroke-width="1" fill="none" />\n`;
    }
  });

  svgString += `</g>\n</svg>`;
  return svgString;
}


function projectToScreen(vector3: THREE.Vector3, projectionMatrix: THREE.Matrix4, width: number, height: number): { x: number, y: number } {
    const projected = vector3.clone().applyMatrix4(projectionMatrix);
    // Convert from Normalized Device Coordinates (NDC) to screen coordinates
    // NDC ranges from -1 to 1 for x and y
    const x = (projected.x * 0.5 + 0.5) * width - width / 2;
    const y = (projected.y * 0.5 + 0.5) * height - height / 2;
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

export function createLightSources(lights: SceneLight[]): THREE.Light[] {
  return lights.map(lightData => {
    let light: THREE.Light;
    switch (lightData.type) {
      case 'directional':
        const dirLight = new THREE.DirectionalLight(lightData.color, lightData.intensity);
        dirLight.position.set(lightData.position.x, lightData.position.y, lightData.position.z);
        dirLight.target.position.set(lightData.target.x, lightData.target.y, lightData.target.z);
        // dirLight.castShadow = lightData.castShadow; // This is for THREE's shadow system, not hatching
        light = dirLight;
        break;
      // Add other light types (spotlight, pointlight) here if needed
      default:
        const ambient = new THREE.AmbientLight(0xffffff, 0.2); // Fallback ambient light
        light = ambient;
    }
    light.userData = { id: lightData.id, hatchAngle: lightData.hatchAngle }; // Store ID and hatch angle
    return light;
  });
}
