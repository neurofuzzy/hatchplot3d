
import * as THREE from 'three';
import type { HatchPath, SceneLight, SceneObject } from '@/types';

// Helper function: Intersect two infinite coplanar lines in 3D
// Line 1: p1 + t*d1
// Line 2: p2 + u*d2
function intersectCoplanarLines(
    p1: THREE.Vector3, d1: THREE.Vector3,
    p2: THREE.Vector3, d2: THREE.Vector3,
    epsilon = 1e-6
): THREE.Vector3 | null {
    const d1Norm = d1.clone().normalize();
    const d2Norm = d2.clone().normalize();

    // Check if lines are parallel
    const crossDirs = new THREE.Vector3().crossVectors(d1Norm, d2Norm);
    if (crossDirs.lengthSq() < epsilon * epsilon) {
        return null;
    }

    const w0 = new THREE.Vector3().subVectors(p1, p2);
    const a = d1.dot(d1); 
    const b = d1.dot(d2);
    const c = d2.dot(d2);
    const d = d1.dot(w0);
    const e = d2.dot(w0);

    const denom = a * c - b * b;

    if (Math.abs(denom) < epsilon * epsilon) {
        return null;
    }

    const t = (b * e - c * d) / denom;
    return p1.clone().addScaledVector(d1, t);
}

// Helper: Check if point P lies on segment AB (P must be collinear with A,B)
function isPointOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, epsilon = 1e-5): boolean {
    const abDistSq = a.distanceToSquared(b);
    if (abDistSq < epsilon * epsilon) { 
        return p.distanceToSquared(a) < epsilon * epsilon;
    }
    const pa = new THREE.Vector3().subVectors(p,a);
    const ba = new THREE.Vector3().subVectors(b,a);
    const dotPaBa = pa.dot(ba);
    if (dotPaBa < -epsilon || dotPaBa > abDistSq + epsilon) { 
        return false;
    }
    // Additionally, check for collinearity robustly using cross product
    // If P, A, B are collinear, cross product (P-A)x(B-A) should be zero vector.
    const crossCollinear = new THREE.Vector3().crossVectors(pa, ba);
    if (crossCollinear.lengthSq() > epsilon * epsilon * abDistSq) { // scaled epsilon for robustness
        return false; // Not collinear enough
    }
    return true;
}


export function generateHatchLines(
  objects: SceneObject[],
  lights: SceneLight[],
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera // Unused for generation for now
): HatchPath[] {
  const allHatchLines: HatchPath[] = [];
  if (objects.length === 0 || lights.length === 0) {
    return [];
  }

  const tempMeshes = createObjectMeshes(objects);

  tempMeshes.forEach((mesh) => {
    mesh.updateMatrixWorld(true);
    const geometry = mesh.geometry;
    const worldMatrix = mesh.matrixWorld;

    const positionsAttr = geometry.attributes.position;
    const indicesAttr = geometry.index;
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < positionsAttr.count; i++) {
      vertices.push(new THREE.Vector3().fromBufferAttribute(positionsAttr, i));
    }

    lights.forEach((light) => {
      if (light.type !== 'directional') return;

      const lightSourcePos = new THREE.Vector3(light.position.x, light.position.y, light.position.z);
      const lightTargetPos = new THREE.Vector3(light.target.x, light.target.y, light.target.z);
      const lightRayDirection = new THREE.Vector3().subVectors(lightTargetPos, lightSourcePos).normalize();

      const processTriangle = (vA_local: THREE.Vector3, vB_local: THREE.Vector3, vC_local: THREE.Vector3) => {
        const vA = vA_local.clone().applyMatrix4(worldMatrix);
        const vB = vB_local.clone().applyMatrix4(worldMatrix);
        const vC = vC_local.clone().applyMatrix4(worldMatrix);

        const edge1 = new THREE.Vector3().subVectors(vB, vA);
        const edge2 = new THREE.Vector3().subVectors(vC, vA);
        const triNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

        if (triNormal.lengthSq() < 0.0001) return; 

        if (triNormal.dot(lightRayDirection) < -0.01) { 
          const numLines = Math.max(1, Math.floor(light.intensity * 15)); 

          let refEdge = edge1.lengthSq() > edge2.lengthSq() ? edge1.clone() : edge2.clone();
          if (refEdge.lengthSq() < 0.0001) { 
            refEdge = new THREE.Vector3().subVectors(vC,vB);
            if (refEdge.lengthSq() < 0.0001) return; 
          }

          let hatchBaseDir = refEdge.clone().normalize();
          hatchBaseDir.applyAxisAngle(triNormal, THREE.MathUtils.degToRad(light.hatchAngle));

          const hatchLineDir = new THREE.Vector3(); // Declare once
          hatchLineDir.crossVectors(triNormal, hatchBaseDir).normalize();
          
          if (hatchLineDir.lengthSq() < 0.5) { 
             let fallbackBaseDir = new THREE.Vector3(1,0,0).applyQuaternion(mesh.quaternion);
             fallbackBaseDir.projectOnPlane(triNormal).normalize();
             
             if (fallbackBaseDir.lengthSq() < 0.5) {
                fallbackBaseDir = new THREE.Vector3(0,0,1).applyQuaternion(mesh.quaternion); // Try Z-axis if X fails
                fallbackBaseDir.projectOnPlane(triNormal).normalize();
             }

             if (fallbackBaseDir.lengthSq() < 0.5) return; 
             
             // Apply hatchAngle to this new fallbackBaseDir
             fallbackBaseDir.applyAxisAngle(triNormal, THREE.MathUtils.degToRad(light.hatchAngle));
             
             hatchLineDir.crossVectors(triNormal, fallbackBaseDir).normalize(); 
             if(hatchLineDir.lengthSq() < 0.5) return; 
          }


          const scanAxis = new THREE.Vector3().crossVectors(hatchLineDir, triNormal).normalize();
          if (scanAxis.lengthSq() < 0.5) return; // scanAxis could not be determined

          const projA = vA.dot(scanAxis);
          const projB = vB.dot(scanAxis);
          const projC = vC.dot(scanAxis);
          const minProj = Math.min(projA, projB, projC);
          const maxProj = Math.max(projA, projB, projC);
          const scanRange = maxProj - minProj;

          if (scanRange < 0.001) return; 

          const spacing = scanRange / (numLines + 1);
          const centroid = new THREE.Vector3().add(vA).add(vB).add(vC).divideScalar(3);
          const centroidProj = centroid.dot(scanAxis);

          for (let i = 1; i <= numLines; i++) {
            const scanPos = minProj + i * spacing;
            const originForScanLine = centroid.clone().addScaledVector(scanAxis, scanPos - centroidProj);

            const intersections: THREE.Vector3[] = [];
            const edges = [
                {p1: vA, p2: vB, d: edge1},
                {p1: vB, p2: vC, d: new THREE.Vector3().subVectors(vC, vB)},
                {p1: vC, p2: vA, d: new THREE.Vector3().subVectors(vA, vC)}
            ];

            edges.forEach(edge => {
                if (edge.d.lengthSq() < 0.000001) return; // Skip zero-length edges
                const edgeDir = edge.d.clone().normalize(); // Normalize for robust intersection check
                const intersection = intersectCoplanarLines(originForScanLine, hatchLineDir, edge.p1, edge.d /* Use non-normalized edge.d */);
                if (intersection) {
                    if (isPointOnSegment(intersection, edge.p1, edge.p2)) {
                        if (!intersections.some(pt => pt.distanceToSquared(intersection) < 0.00001)) {
                           intersections.push(intersection);
                        }
                    }
                }
            });

            intersections.sort((p_a, p_b) => { 
                return p_a.dot(hatchLineDir) - p_b.dot(hatchLineDir);
            });

            if (intersections.length >= 2) {
                const p1 = intersections[0];
                const p2 = intersections[intersections.length - 1];
                if (p1.distanceToSquared(p2) > 0.0001) { 
                    allHatchLines.push([{
                        start: { x: p1.x, y: p1.y, z: p1.z },
                        end: { x: p2.x, y: p2.y, z: p2.z }
                    }]);
                }
            }
          }
        }
      }; 

      if (indicesAttr) {
        for (let i = 0; i < indicesAttr.count; i += 3) {
          const vA_idx = indicesAttr.getX(i);
          const vB_idx = indicesAttr.getX(i + 1);
          const vC_idx = indicesAttr.getX(i + 2);
          processTriangle(vertices[vA_idx], vertices[vB_idx], vertices[vC_idx]);
        }
      } else {
        for (let i = 0; i < vertices.length; i += 3) {
          processTriangle(vertices[i], vertices[i + 1], vertices[i + 2]);
        }
      }
    }); 
  }); 

  tempMeshes.forEach(mesh => {
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => m.dispose());
    } else {
      (mesh.material as THREE.Material).dispose();
    }
  });

  return allHatchLines;
}


export function exportToSVG(hatchPaths: HatchPath[], camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, sceneWidth: number, sceneHeight: number): string {
  let svgString = `<svg width="${sceneWidth}" height="${sceneHeight}" xmlns="http://www.w3.org/2000/svg" style="background-color: hsl(var(--background));">\\n`;
  svgString += `<g transform="translate(${sceneWidth / 2}, ${sceneHeight / 2}) scale(1, -1)">\\n`; 

  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const projectionMatrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  let strokeColor = "hsl(0, 0%, 98%)"; 
  if (typeof window !== 'undefined') {
    try {
      const fgCssValue = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim();
      const hslParts = fgCssValue.match(/^(\d{1,3})\s+([\d.]+)%\s+([\d.]+)%$/);
      if (hslParts) {
        strokeColor = `hsl(${hslParts[1]}, ${hslParts[2]}%, ${hslParts[3]}%)`;
      } else {
        strokeColor = fgCssValue;
      }
    } catch (e) {
      console.warn("Failed to parse --foreground for SVG export, defaulting to #f0f0f0", e);
      strokeColor = "#f0f0f0"; 
    }
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

      svgString += `  <polyline points="${points.join(' ')}" stroke="${strokeColor}" stroke-width="0.5" fill="none" />\\n`;
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
    const material = new THREE.MeshStandardMaterial({
      color: obj.color,
      side: THREE.DoubleSide, 
      polygonOffset: true, 
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      roughness: 0.8, // Reduce shininess for better hatch visibility
      metalness: 0.1
    });

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
        console.warn(`Unknown object type "${obj.type}", defaulting to BoxGeometry.`);
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
        const dirLight = new THREE.DirectionalLight(lightData.color, 0.8); 
        dirLight.position.set(lightData.position.x, lightData.position.y, lightData.position.z);
        dirLight.target.position.set(lightData.target.x, lightData.target.y, lightData.target.z);
        light = dirLight;
        helper = new THREE.DirectionalLightHelper(dirLight, 1, new THREE.Color(lightData.color).multiplyScalar(0.7)); 
        break;
      default:
        const ambient = new THREE.AmbientLight(0xffffff, 0.1);
        light = ambient;
        console.warn(`Unsupported or unknown light type "${lightData.type}", defaulting to AmbientLight.`);
    }
    light.userData = { id: lightData.id, hatchAngle: lightData.hatchAngle, originalIntensity: lightData.intensity }; 
    return {light, helper};
  });
}
