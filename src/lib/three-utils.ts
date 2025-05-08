import * as THREE from 'three';
import type { HatchPath, SceneLight, SceneObject } from '@/types';

/**
 * Generates hatch lines based on scene objects, lights, and camera.
 *
 * !!! IMPORTANT DEVELOPMENT NOTE !!!
 * This function is a more advanced PLACEHOLDER. It now attempts to generate hatch lines
 * on the faces of object bounding boxes that are oriented towards the light source.
 *
 * What it DOES:
 *   - Calculates the world-space bounding box of each object.
 *   - For each face of the bounding box, determines if it's "lit" by checking its normal
 *     against the light direction.
 *   - Generates hatch lines on these "lit" faces, oriented by the light's hatchAngle
 *     and density controlled by light.intensity.
 *   - The lines are generated in 3D space on the surface of these bounding box faces.
 *
 * What it DOES NOT do (still):
 *   - True per-pixel or per-triangle projection of light onto complex 3D object surfaces.
 *     It uses object-aligned bounding boxes as a simplification.
 *   - Accurate shadow calculations (no object self-shadowing or inter-object shadowing).
 *     A face is either "lit" or not based on its normal and light direction.
 *   - Consideration of object material properties beyond its basic geometry.
 *   - Handling of light falloff or attenuation for non-directional lights (if they were added).
 *
 * This version provides a better visual approximation of how light might interact
 * with objects by showing hatches on relevant sides, but it's not a full 3D hatching renderer.
 * A full implementation is significantly more complex.
 */
export function generateHatchLines(
  objects: SceneObject[],
  lights: SceneLight[],
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera // Unused in this placeholder for generation logic
): HatchPath[] {
  const hatchLines: HatchPath[] = [];

  if (objects.length === 0) {
    return []; // No objects, no hatches
  }

  // Create temporary meshes to get world-space bounding boxes and transformations
  const tempMeshes = createObjectMeshes(objects);

  tempMeshes.forEach((mesh) => {
    mesh.updateMatrixWorld(true); // Ensure world matrix is up-to-date
    const box = new THREE.Box3().setFromObject(mesh); // World-space bounding box
    const objectCenter = new THREE.Vector3();
    box.getCenter(objectCenter);

    const faces = [ // Define faces by normals and a point on the face (center)
      { normal: new THREE.Vector3(1, 0, 0), centerOffset: new THREE.Vector3(box.max.x - objectCenter.x, 0, 0), uVec: new THREE.Vector3(0, 1, 0), vVec: new THREE.Vector3(0, 0, 1), size: new THREE.Vector2(box.max.y - box.min.y, box.max.z - box.min.z) }, // +X
      { normal: new THREE.Vector3(-1, 0, 0), centerOffset: new THREE.Vector3(box.min.x - objectCenter.x, 0, 0), uVec: new THREE.Vector3(0, -1, 0), vVec: new THREE.Vector3(0, 0, 1), size: new THREE.Vector2(box.max.y - box.min.y, box.max.z - box.min.z) }, // -X
      { normal: new THREE.Vector3(0, 1, 0), centerOffset: new THREE.Vector3(0, box.max.y - objectCenter.y, 0), uVec: new THREE.Vector3(1, 0, 0), vVec: new THREE.Vector3(0, 0, 1), size: new THREE.Vector2(box.max.x - box.min.x, box.max.z - box.min.z) }, // +Y
      { normal: new THREE.Vector3(0, -1, 0), centerOffset: new THREE.Vector3(0, box.min.y - objectCenter.y, 0), uVec: new THREE.Vector3(-1, 0, 0), vVec: new THREE.Vector3(0, 0, 1), size: new THREE.Vector2(box.max.x - box.min.x, box.max.z - box.min.z) }, // -Y
      { normal: new THREE.Vector3(0, 0, 1), centerOffset: new THREE.Vector3(0, 0, box.max.z - objectCenter.z), uVec: new THREE.Vector3(1, 0, 0), vVec: new THREE.Vector3(0, -1, 0), size: new THREE.Vector2(box.max.x - box.min.x, box.max.y - box.min.y) }, // +Z
      { normal: new THREE.Vector3(0, 0, -1), centerOffset: new THREE.Vector3(0, 0, box.min.z - objectCenter.z), uVec: new THREE.Vector3(-1, 0, 0), vVec: new THREE.Vector3(0, -1, 0), size: new THREE.Vector2(box.max.x - box.min.x, box.max.y - box.min.y) }, // -Z
    ];


    lights.forEach((light) => {
      if (light.type === 'directional') {
        const lightPosition = new THREE.Vector3(light.position.x, light.position.y, light.position.z);
        const lightTarget = new THREE.Vector3(light.target.x, light.target.y, light.target.z);
        const lightDirection = new THREE.Vector3().subVectors(lightPosition, lightTarget).normalize(); // Light points FROM position TO target
                                                                                                     // So direction vector from surface TO light is this.

        faces.forEach(face => {
          // Transform face normal from object's local space (axis-aligned) to world space
          // For AABB, the local normals are axis-aligned, so mesh.matrixWorld rotation part is key
          const worldNormal = face.normal.clone().applyQuaternion(mesh.quaternion).normalize();
          
          const dot = worldNormal.dot(lightDirection);

          if (dot > 0.1) { // Face is somewhat oriented towards the light source (0.1 threshold to catch glancing angles)
            const numLines = Math.floor(light.intensity * dot * 10); // Intensity and angle affect density
            const hatchAngleRad = THREE.MathUtils.degToRad(light.hatchAngle);
            const faceCenter = objectCenter.clone().add(face.centerOffset.clone().applyQuaternion(mesh.quaternion));

            // Hatch line generation on this face
            // Create a basis on the plane of the face
            const faceUVec = face.uVec.clone().applyQuaternion(mesh.quaternion).normalize();
            const faceVVec = face.vVec.clone().applyQuaternion(mesh.quaternion).normalize();
            
            const spacing = Math.min(face.size.x, face.size.y) / (numLines + 1) ; // Spacing based on face size and line count
            const lineLength = Math.max(face.size.x, face.size.y) * 1.5; // Lines can extend beyond face


            for (let i = 0; i < numLines; i++) {
                // Position lines across the V-direction of the face, spaced in U-direction (or vice-versa)
                // This is a simplified way to distribute lines.
                const linePosU = (i - (numLines -1) / 2) * spacing;

                // Define line endpoints in the plane of the face, centered
                let p1 = new THREE.Vector3()
                    .addScaledVector(faceUVec, linePosU)
                    .addScaledVector(faceVVec, -lineLength / 2);
                let p2 = new THREE.Vector3()
                    .addScaledVector(faceUVec, linePosU)
                    .addScaledVector(faceVVec, lineLength / 2);

                // Rotate these points by hatchAngleRad around the face normal
                const hatchRotation = new THREE.Quaternion().setFromAxisAngle(worldNormal, hatchAngleRad);
                p1.applyQuaternion(hatchRotation);
                p2.applyQuaternion(hatchRotation);

                // Translate to face center
                p1.add(faceCenter);
                p2.add(faceCenter);

                // Clip lines to the face (simple bounding box clipping in 2D plane of face)
                // For a robust solution, use Liang-Barsky or Sutherland-Hodgman algorithm
                // This is a very simplified "clipping" - just ensure points are within bounding box extent
                // (More complex clipping is out of scope for this placeholder)
                
                const segment = {
                    start: { x: p1.x, y: p1.y, z: p1.z },
                    end: { x: p2.x, y: p2.y, z: p2.z },
                };
                hatchLines.push([segment]);
            }
          }
        });
      }
    });
  });


  // Cleanup temporary meshes
  tempMeshes.forEach(mesh => {
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => m.dispose());
    } else {
      mesh.material.dispose();
    }
  });

  return hatchLines;
}


export function exportToSVG(hatchPaths: HatchPath[], camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, sceneWidth: number, sceneHeight: number): string {
  let svgString = `<svg width="${sceneWidth}" height="${sceneHeight}" xmlns="http://www.w3.org/2000/svg" style="background-color: hsl(var(--background));">\\n`;
  svgString += `<g transform="translate(${sceneWidth / 2}, ${sceneHeight / 2}) scale(1, -1)">\\n`;

  camera.updateMatrixWorld(); 
  camera.updateProjectionMatrix(); 

  const projectionMatrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  let strokeColor = "hsl(0, 0%, 98%)"; // Default white for dark themes
  if (typeof window !== 'undefined') {
    strokeColor = `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()})`;
  }


  hatchPaths.forEach(path => {
    if (path.length > 0) {
      const points: string[] = [];
      path.forEach((segment, segmentIndex) => {
        const start3D = new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z);
        const end3D = new THREE.Vector3(segment.end.x, segment.end.y, segment.end.z);

        const start2D = projectToScreen(start3D, projectionMatrix, sceneWidth, sceneHeight);
        const end2D = projectToScreen(end3D, projectionMatrix, sceneWidth, sceneHeight);
        
        if (segmentIndex === 0) { 
            points.push(`${start2D.x.toFixed(2)},${start2D.y.toFixed(2)}`);
        }
        points.push(`${end2D.x.toFixed(2)},${end2D.y.toFixed(2)}`);
      });
      
      svgString += `  <polyline points="${points.join(' ')}" stroke="${strokeColor}" stroke-width="1" fill="none" />\\n`;
    }
  });

  svgString += `</g>\\n</svg>`;
  return svgString;
}


function projectToScreen(vector3: THREE.Vector3, projectionMatrix: THREE.Matrix4, width: number, height: number): { x: number, y: number } {
    const projected = vector3.clone().applyMatrix4(projectionMatrix);
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
        geometry = new THREE.BoxGeometry(1, 1, 1); 
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
    mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
    mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
    mesh.userData = { id: obj.id }; 
    return mesh;
  });
}

export function createLightSources(lights: SceneLight[]): Array<{light: THREE.Light, helper?: THREE.DirectionalLightHelper | THREE.SpotLightHelper | THREE.PointLightHelper}> {
  return lights.map(lightData => {
    let light: THREE.Light;
    let helper: THREE.DirectionalLightHelper | THREE.SpotLightHelper | THREE.PointLightHelper | undefined = undefined; 

    switch (lightData.type) {
      case 'directional':
        const dirLight = new THREE.DirectionalLight(lightData.color, lightData.intensity);
        dirLight.position.set(lightData.position.x, lightData.position.y, lightData.position.z);
        dirLight.target.position.set(lightData.target.x, lightData.target.y, lightData.target.z);
        light = dirLight;
        helper = new THREE.DirectionalLightHelper(dirLight, 1, new THREE.Color(lightData.color)); 
        break;
      default:
        const ambient = new THREE.AmbientLight(0xffffff, 0.2); 
        light = ambient;
    }
    light.userData = { id: lightData.id, hatchAngle: lightData.hatchAngle };
    return {light, helper};
  });
}
