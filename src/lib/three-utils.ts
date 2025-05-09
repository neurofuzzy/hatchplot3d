
import * as THREE from 'three';
import type { HatchPath, SceneLight, SceneObject, HatchLineSegment } from '@/types';

export function generateHatchLines(
  objectMeshes: THREE.Mesh[],
  lights: SceneLight[],
  _camera: THREE.PerspectiveCamera | THREE.OrthographicCamera // Camera currently unused for generation logic
): HatchPath[] {
  const allHatchPaths: HatchPath[] = [];

  if (objectMeshes.length === 0 || lights.length === 0) {
    return [];
  }

  objectMeshes.forEach(mesh => {
    if (mesh.userData.isHelper) return; // Skip helper objects like grid/axes
    mesh.updateMatrixWorld(true); // Ensure matrices are up-to-date
  });


  lights.forEach((light) => {
    if (light.type !== 'directional') return;

    const lightPosition = new THREE.Vector3(light.position.x, light.position.y, light.position.z);
    const lightTarget = new THREE.Vector3(light.target.x, light.target.y, light.target.z);
    const lightDirection = new THREE.Vector3().subVectors(lightTarget, lightPosition).normalize();

    const sceneBoundingBox = new THREE.Box3();
    objectMeshes.forEach(mesh => {
      if (mesh.userData.isHelper) return;
      sceneBoundingBox.expandByObject(mesh);
    });

    if (sceneBoundingBox.isEmpty()) return;

    const planePoint = sceneBoundingBox.getCenter(new THREE.Vector3());
    const hatchBasePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(lightDirection, planePoint);

    let hatchLineDirectionOnPlane = new THREE.Vector3(1, 0, 0);
    if (Math.abs(hatchLineDirectionOnPlane.dot(lightDirection)) > 0.99) {
        hatchLineDirectionOnPlane.set(0, 1, 0);
    }
    hatchLineDirectionOnPlane.projectOnPlane(lightDirection).normalize();
    if (hatchLineDirectionOnPlane.lengthSq() < 0.1) {
        hatchLineDirectionOnPlane.set(0,0,1);
        hatchLineDirectionOnPlane.projectOnPlane(lightDirection).normalize();
        if (hatchLineDirectionOnPlane.lengthSq() < 0.1) return;
    }
    hatchLineDirectionOnPlane.applyAxisAngle(lightDirection, THREE.MathUtils.degToRad(light.hatchAngle));

    const scanDirection = new THREE.Vector3().crossVectors(hatchLineDirectionOnPlane, lightDirection).normalize();
     if (scanDirection.lengthSq() < 0.1) return;


    let minScan = Infinity, maxScan = -Infinity;
    objectMeshes.forEach(mesh => {
      if (mesh.userData.isHelper) return;
      const geom = mesh.geometry;
      const posAttr = geom.attributes.position;
      const tempVertex = new THREE.Vector3();
      for (let i = 0; i < posAttr.count; i++) {
        tempVertex.fromBufferAttribute(posAttr, i);
        const vWorld = tempVertex.clone().applyMatrix4(mesh.matrixWorld);
        const vProjectedOnPlane = hatchBasePlane.projectPoint(vWorld, new THREE.Vector3());
        const scanVal = vProjectedOnPlane.dot(scanDirection);
        minScan = Math.min(minScan, scanVal);
        maxScan = Math.max(maxScan, scanVal);
      }
    });
    
    if (minScan === Infinity || maxScan === -Infinity || (maxScan - minScan) < 0.001) return;

    const scanRange = maxScan - minScan;
    const numHatchLines = Math.max(1, Math.floor(light.intensity * scanRange * 10)); // Increased density factor
    const lineSpacing = scanRange / (numHatchLines + 1);

    for (let i = 1; i <= numHatchLines; i++) {
      const scanOffset = minScan + i * lineSpacing;
      const masterLinePoint = planePoint.clone().addScaledVector(scanDirection, scanOffset - planePoint.dot(scanDirection));

      const hatchCuttingPlaneNormal = new THREE.Vector3().crossVectors(hatchLineDirectionOnPlane, lightDirection).normalize();
      if (hatchCuttingPlaneNormal.lengthSq() < 0.1) continue;
      const hatchCuttingPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(hatchCuttingPlaneNormal, masterLinePoint);
      
      const segmentsForThisMasterLine: HatchLineSegment[] = [];

      objectMeshes.forEach(mesh => {
        if (mesh.userData.isHelper) return; // Ensure we don't try to hatch helper objects

        const geometry = mesh.geometry;
        const positionAttribute = geometry.attributes.position;
        const worldMatrix = mesh.matrixWorld;

        const vertices: THREE.Vector3[] = [];
        const tempVertex = new THREE.Vector3();
        for (let j = 0; j < positionAttribute.count; j++) {
          tempVertex.fromBufferAttribute(positionAttribute, j);
          vertices.push(tempVertex.clone());
        }

        const processTriangle = (vA_local: THREE.Vector3, vB_local: THREE.Vector3, vC_local: THREE.Vector3) => {
          const vA_world = vA_local.clone().applyMatrix4(worldMatrix);
          const vB_world = vB_local.clone().applyMatrix4(worldMatrix);
          const vC_world = vC_local.clone().applyMatrix4(worldMatrix);

          const tri = new THREE.Triangle(vA_world, vB_world, vC_world);
          const triNormal = new THREE.Vector3();
          tri.getNormal(triNormal);

          if (triNormal.dot(lightDirection) > -0.001) { 
            return;
          }

          const intersectionPoints: THREE.Vector3[] = [];
          const edges = [
            new THREE.Line3(vA_world, vB_world),
            new THREE.Line3(vB_world, vC_world),
            new THREE.Line3(vC_world, vA_world),
          ];

          edges.forEach(edge => {
            const intersectPt = new THREE.Vector3();
            if (hatchCuttingPlane.intersectLine(edge, intersectPt)) {
              if (!intersectionPoints.some(p => p.distanceToSquared(intersectPt) < 0.000001)) {
                intersectionPoints.push(intersectPt.clone());
              }
            }
          });
          
          if (intersectionPoints.length === 2) {
            const p1 = intersectionPoints[0];
            const p2 = intersectionPoints[1];
            if (p1.distanceToSquared(p2) > 0.00001) {
              segmentsForThisMasterLine.push({
                start: { x: p1.x, y: p1.y, z: p1.z },
                end: { x: p2.x, y: p2.y, z: p2.z },
              });
            }
          } else if (intersectionPoints.length > 2) {
            // Handle coplanar case or multiple edge intersections by sorting along hatch direction
             intersectionPoints.sort((a, b) => {
              return a.dot(hatchLineDirectionOnPlane) - b.dot(hatchLineDirectionOnPlane);
            });
            const p_start = intersectionPoints[0];
            const p_end = intersectionPoints[intersectionPoints.length - 1];
            if (p_start.distanceToSquared(p_end) > 0.00001) {
              segmentsForThisMasterLine.push({
                start: { x: p_start.x, y: p_start.y, z: p_start.z },
                end: { x: p_end.x, y: p_end.y, z: p_end.z },
              });
            }
          }
        };

        const indices = geometry.index;
        if (indices) {
          for (let k = 0; k < indices.count; k += 3) {
            processTriangle(vertices[indices.getX(k)], vertices[indices.getX(k + 1)], vertices[indices.getX(k + 2)]);
          }
        } else {
          for (let k = 0; k < vertices.length; k += 3) {
            processTriangle(vertices[k], vertices[k + 1], vertices[k + 2]);
          }
        }
      });

      // TODO: Join collinear and overlapping/adjacent segments from segmentsForThisMasterLine
      // For now, each segment found for this master line becomes its own path.
      segmentsForThisMasterLine.forEach(segment => {
        allHatchPaths.push([segment]);
      });
    }
  });

  return allHatchPaths;
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
        const testColor = new THREE.Color();
        try {
            testColor.set(fgCssValue);
            strokeColor = fgCssValue; 
        } catch (e) {
            console.warn("Failed to parse --foreground for SVG export (not HSL or recognized format), defaulting.", e);
        }
      }
    } catch (e) {
      console.warn("Failed to parse --foreground for SVG export, defaulting.", e);
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
    // Use a distinct material for scene objects vs helpers for hatching/interaction logic if needed.
    const material = new THREE.MeshStandardMaterial({
      color: obj.color,
      side: THREE.DoubleSide, 
      polygonOffset: true, 
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      roughness: 0.8, 
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
    mesh.userData = { id: obj.id, type: obj.type, isHelper: false }; // Mark as not a helper
    return mesh;
  });
}

export function createLightSources(lights: SceneLight[]): Array<{light: THREE.Light, helper?: THREE.DirectionalLightHelper | THREE.SpotLightHelper | THREE.PointLightHelper}> {
  return lights.map(lightData => {
    let light: THREE.Light;
    let helper: THREE.DirectionalLightHelper | THREE.SpotLightHelper | THREE.PointLightHelper | undefined = undefined;
    const lightColor = new THREE.Color(lightData.color);

    switch (lightData.type) {
      case 'directional':
        const dirLight = new THREE.DirectionalLight(lightColor, 0.8); 
        dirLight.position.set(lightData.position.x, lightData.position.y, lightData.position.z);
        dirLight.target.position.set(lightData.target.x, lightData.target.y, lightData.target.z);
        // dirLight.castShadow = true; // For potential future shadow mapping, not directly SVG hatching
        light = dirLight;
        
        // Mark the light target for selection and manipulation
        dirLight.target.userData = {
          id: `${lightData.id}-target`,
          parentLightId: lightData.id,
          isLightTarget: true,
          isHelper: false
        };
        
        // Create a visual representation of the target
        const targetMarker = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 8, 8),
          new THREE.MeshBasicMaterial({ 
            color: lightColor,
            transparent: true,
            opacity: 0.5,
            wireframe: true
          })
        );
        targetMarker.position.copy(dirLight.target.position);
        targetMarker.userData = { 
          id: `${lightData.id}-target-visual`,
          parentLightId: lightData.id,
          isLightTarget: true,
          isHelper: true
        };
        dirLight.target.add(targetMarker);
        
        let helperColor = lightColor.clone().lerp(new THREE.Color(0xffffff), 0.5); // Make helper color lighter
        if (helperColor.getHSL({h:0,s:0,l:0}).l < 0.2) helperColor.setHex(0x808080); // Ensure it's visible
        if (helperColor.getHSL({h:0,s:0,l:0}).l > 0.8) helperColor.setHex(0x808080);

        helper = new THREE.DirectionalLightHelper(dirLight, 0.5, helperColor); 
        break;
      default:
        const ambient = new THREE.AmbientLight(0xffffff, 0.1); 
        light = ambient;
        console.warn(`Unsupported or unknown light type "${lightData.type}", defaulting to AmbientLight.`);
    }
    light.userData = { 
        id: lightData.id, 
        hatchAngle: lightData.hatchAngle, 
        originalIntensity: lightData.intensity,
        isLight: true,
        isHelper: false
    }; 
    if (helper) {
        helper.userData = { 
          id: `${lightData.id}-helper`,
          parentLightId: lightData.id,
          isHelper: true 
        }; // Mark helper itself as a helper object
    }
    return {light, helper};
  });
}
