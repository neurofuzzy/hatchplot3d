import * as THREE from 'three';
import type { HatchPath, SceneLight, SceneObject, HatchLineSegment } from '@/types';
function generateHatchLinesForDirectionalLight(
  light: SceneLight,
  lightDirection: THREE.Vector3,
  objectMeshes: THREE.Mesh[],
  sceneBoundingBox: THREE.Box3
): HatchPath[] {
  const generatedPaths: HatchPath[] = [];

  if (sceneBoundingBox.isEmpty()) return [];

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
      if (hatchLineDirectionOnPlane.lengthSq() < 0.1) return [];
  }
  hatchLineDirectionOnPlane.applyAxisAngle(lightDirection, THREE.MathUtils.degToRad(light.hatchAngle));

  const scanDirection = new THREE.Vector3().crossVectors(hatchLineDirectionOnPlane, lightDirection).normalize();
   if (scanDirection.lengthSq() < 0.1) return [];

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
  
  if (minScan === Infinity || maxScan === -Infinity || (maxScan - minScan) < 0.001) return [];

  const scanRange = maxScan - minScan;
  const numHatchLines = Math.max(1, Math.floor(light.intensity * scanRange * 20)); // Doubled density factor
  const lineSpacing = scanRange / (numHatchLines + 1);

  for (let i = 1; i <= numHatchLines; i++) { // Master hatch line index (i)
    const scanOffset = minScan + i * lineSpacing;
    const masterLinePoint = planePoint.clone().addScaledVector(scanDirection, scanOffset - planePoint.dot(scanDirection));

    const hatchCuttingPlaneNormal = new THREE.Vector3().crossVectors(hatchLineDirectionOnPlane, lightDirection).normalize();
    if (hatchCuttingPlaneNormal.lengthSq() < 0.1) continue;
    const hatchCuttingPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(hatchCuttingPlaneNormal, masterLinePoint);
    
    const segmentsForThisMasterLine: HatchLineSegment[] = [];

    objectMeshes.forEach(mesh => {
      if (mesh.userData.isHelper) return;

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

        const rawDotNL = triNormal.dot(lightDirection);
        if (rawDotNL > -0.001) {
          return;
        }

        const dotNL = -rawDotNL;
        let requiredFaceAlignment = 0.0;

        if (i % 2 === 0) { // `i` is the master hatch line index from the outer loop
          requiredFaceAlignment = 0.50; 
        } else {
          requiredFaceAlignment = 0.1;
        }

        if (dotNL < requiredFaceAlignment) {
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

    segmentsForThisMasterLine.forEach(segment => {
      generatedPaths.push([segment]);
    });
  }
  return generatedPaths;
}

export function generateHatchLines(
  objectMeshes: THREE.Mesh[],
  lights: SceneLight[],
  _camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
): HatchPath[] {
  const allHatchPaths: HatchPath[] = [];

  if (objectMeshes.length === 0 || lights.length === 0) {
    return [];
  }

  objectMeshes.forEach(mesh => {
    if (mesh.userData.isHelper) return;
    mesh.updateMatrixWorld(true);
  });

  lights.forEach((light) => {
    const lightPosition = new THREE.Vector3(light.position.x, light.position.y, light.position.z);
    const lightTarget = new THREE.Vector3(light.target.x, light.target.y, light.target.z);
    const lightDirection = new THREE.Vector3().subVectors(lightTarget, lightPosition).normalize();

    if (light.type === 'directional') {
      const sceneBoundingBox = new THREE.Box3();
      objectMeshes.forEach(mesh => {
        if (mesh.userData.isHelper) return;
        sceneBoundingBox.expandByObject(mesh);
      });
      const directionalPaths = generateHatchLinesForDirectionalLight(
        light,
        lightDirection,
        objectMeshes,
        sceneBoundingBox
      );
      allHatchPaths.push(...directionalPaths);
    } else if (light.type === 'spotlight') {
      console.log('Processing spotlight:', light.id);
      const spotAngleRad = THREE.MathUtils.degToRad(light.spotAngle || 60); // Default to 60 degrees if not set
      const nearDist = 1.0; // Increased near plane distance for better hatch line distribution

      const nearPlaneCenter = lightPosition.clone().addScaledVector(lightDirection, nearDist);
      const spotlightNearPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(lightDirection, nearPlaneCenter);

      // Determine hatch line orientation on the near plane
      let hatchLineDirectionOnNearPlane = new THREE.Vector3(1, 0, 0);
      if (Math.abs(hatchLineDirectionOnNearPlane.dot(lightDirection)) > 0.99) {
        hatchLineDirectionOnNearPlane.set(0, 1, 0);
      }
      hatchLineDirectionOnNearPlane.projectOnPlane(lightDirection).normalize();
      if (hatchLineDirectionOnNearPlane.lengthSq() < 0.1) {
        hatchLineDirectionOnNearPlane.set(0,0,1);
        hatchLineDirectionOnNearPlane.projectOnPlane(lightDirection).normalize();
        if (hatchLineDirectionOnNearPlane.lengthSq() < 0.1) {
            console.warn("Could not determine hatch line direction for spotlight.");
            return [];
        }
      }
      hatchLineDirectionOnNearPlane.applyAxisAngle(lightDirection, THREE.MathUtils.degToRad(light.hatchAngle));

      const scanDirectionOnNearPlane = new THREE.Vector3().crossVectors(hatchLineDirectionOnNearPlane, lightDirection).normalize();
      if (scanDirectionOnNearPlane.lengthSq() < 0.1) {
        console.warn("Could not determine scan direction for spotlight.");
        return [];
      }
      
      const radiusOnNearPlane = nearDist * Math.tan(spotAngleRad);
      const numHatchLines = Math.max(5, Math.floor(light.intensity * 20)); // Base number of lines on intensity, not radius
      const lineSpacing = (2 * radiusOnNearPlane) / (numHatchLines + 1);
      console.log('Spotlight params:', {
        spotAngleRad: spotAngleRad * 180 / Math.PI,
        intensity: light.intensity,
        radiusOnNearPlane,
        numHatchLines,
        lineSpacing
      });

      const spotlightHatchPaths: HatchPath[] = [];
      const finalSpotlightPaths: HatchPath[] = []; // Store the final 3D segments here

      for (let i = 1; i <= numHatchLines; i++) {
        const scanOffset = -radiusOnNearPlane + i * lineSpacing;
        const masterLineCenterOnNearPlane = nearPlaneCenter.clone().addScaledVector(scanDirectionOnNearPlane, scanOffset);
        const halfLength = Math.sqrt(Math.max(0, radiusOnNearPlane * radiusOnNearPlane - scanOffset * scanOffset));
        if (halfLength < 0.001) continue;

        const p1_near = masterLineCenterOnNearPlane.clone().addScaledVector(hatchLineDirectionOnNearPlane, -halfLength);
        const p2_near = masterLineCenterOnNearPlane.clone().addScaledVector(hatchLineDirectionOnNearPlane, halfLength);

        // Create the cutting plane using the light position and the near plane segment
        const cuttingPlaneTriangle = new THREE.Triangle(lightPosition, p1_near, p2_near);
        const cuttingPlane = new THREE.Plane();
        cuttingPlaneTriangle.getPlane(cuttingPlane);

        if (cuttingPlane.normal.lengthSq() < 0.1) {
            console.warn("Degenerate cutting plane for spotlight hatch line.");
            continue;
        }

        const segmentsForThisCuttingPlane: HatchLineSegment[] = [];

        const processTriangleForSpotlight = (vA_local: THREE.Vector3, vB_local: THREE.Vector3, vC_local: THREE.Vector3, meshMatrixWorld: THREE.Matrix4) => {
          const vA_world = vA_local.clone().applyMatrix4(meshMatrixWorld);
          const vB_world = vB_local.clone().applyMatrix4(meshMatrixWorld);
          const vC_world = vC_local.clone().applyMatrix4(meshMatrixWorld);

          const tri = new THREE.Triangle(vA_world, vB_world, vC_world);
          const triNormal = new THREE.Vector3();
          tri.getNormal(triNormal);

          const triCenter = new THREE.Vector3(); // For calculating angular attenuation
          tri.getMidpoint(triCenter);
          const vecToTriCenter = new THREE.Vector3().subVectors(triCenter, lightPosition);
          const angleToTriCenterFromLightAxis = vecToTriCenter.angleTo(lightDirection);

          // Quick reject if triangle's center is outside the cone entirely
          if (angleToTriCenterFromLightAxis > spotAngleRad) {
            return;
          }

          const rawDotNL = triNormal.dot(lightDirection); // How much triangle faces the light source point
          if (rawDotNL > -0.001) { // Back-face culling: if normal points towards or away from light along its direction.
            // Too noisy, only log if we're culling all triangles
            // console.log('Triangle culled - facing away from light', { rawDotNL });
            return;
          }
          
          const dotNL = -rawDotNL; // Should be positive for faces oriented towards the light direction
          let requiredFaceAlignment = 0.0;
          // 'i' is the masterHatchLineIndex from the outer loop, controls pattern
          if (i % 2 === 0) { 
            requiredFaceAlignment = 0.3; // Denser/more lines for these master lines
          } else {
            requiredFaceAlignment = 0.1; // Sparser/less lines for these master lines
          }

          // Attenuation factor based on how far from center of spotlight cone the triangle is
          // Using cosine squared falloff: 1 at center (angle=0), ~0 at edge (angle=spotAngleRad if spotAngleRad is PI/2, but typically smaller)
          // For typical spotAngleRad (e.g., < PI/2), cos(angle) will be > 0. Power enhances falloff.
          const angularAttenuation = Math.pow(Math.cos(angleToTriCenterFromLightAxis), 2); // cos^2 falloff
                                                                                       
          // Effective strength of illumination on the triangle
          const effectiveLightOnTriangle = dotNL * angularAttenuation;
          
          if (effectiveLightOnTriangle < requiredFaceAlignment) { 
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
            // Intersect edge with the cuttingPlane (derived from light pos and near plane hatch segment)
            if (cuttingPlane.intersectLine(edge, intersectPt)) {
                // Basic check: is the intersection point within the spotlight cone?
                const vecToIntersect = new THREE.Vector3().subVectors(intersectPt, lightPosition);
                const angleToLightAxis = vecToIntersect.angleTo(lightDirection);
                if (angleToLightAxis <= spotAngleRad) {
                    // Further check: ensure point is beyond the near plane w.r.t light direction
                    const projectedOntoLightDir = vecToIntersect.dot(lightDirection);
                    if (projectedOntoLightDir >= nearDist - 0.001) { // Add small tolerance
                        if (!intersectionPoints.some(p => p.distanceToSquared(intersectPt) < 0.000001)) {
                            intersectionPoints.push(intersectPt.clone());
                        }
                    }
                }
            }
          });
        
          if (intersectionPoints.length === 2) {
            const p1 = intersectionPoints[0];
            const p2 = intersectionPoints[1];
            if (p1.distanceToSquared(p2) > 0.00001) {
                // Additional check: Ensure both points of the segment are truly within the cone
                // (The individual point check above might pass points that form a segment partially outside)
                const centerP1 = new THREE.Vector3().subVectors(p1, lightPosition);
                const centerP2 = new THREE.Vector3().subVectors(p2, lightPosition);
                if (centerP1.angleTo(lightDirection) <= spotAngleRad && centerP2.angleTo(lightDirection) <= spotAngleRad) {
                    segmentsForThisCuttingPlane.push(
                        { start: { x: p1.x, y: p1.y, z: p1.z }, end: { x: p2.x, y: p2.y, z: p2.z } }
                    );
                }
            }
          } else if (intersectionPoints.length > 2) {
            // Sort points along the cutting plane's hatch direction (approximated)
            // This part might need refinement for robust sorting of co-planar intersections
            intersectionPoints.sort((a, b) => {
                const dir = new THREE.Vector3().subVectors(p2_near, p1_near).normalize(); // Direction of the original hatch line on near plane
                return a.dot(dir) - b.dot(dir);
            });
            const p_start = intersectionPoints[0];
            const p_end = intersectionPoints[intersectionPoints.length - 1];
            if (p_start.distanceToSquared(p_end) > 0.00001) {
                 const centerStart = new THREE.Vector3().subVectors(p_start, lightPosition);
                 const centerEnd = new THREE.Vector3().subVectors(p_end, lightPosition);
                 if (centerStart.angleTo(lightDirection) <= spotAngleRad && centerEnd.angleTo(lightDirection) <= spotAngleRad) {
                    segmentsForThisCuttingPlane.push(
                        { start: { x: p_start.x, y: p_start.y, z: p_start.z }, end: { x: p_end.x, y: p_end.y, z: p_end.z } }
                    );
                 }
            }
          }
        };

        objectMeshes.forEach(mesh => {
          if (mesh.userData.isHelper) return;
          
          const geometry = mesh.geometry;
          const positionAttribute = geometry.attributes.position;
          const worldMatrix = mesh.matrixWorld;

          const localVertices: THREE.Vector3[] = [];
          const tempVertex = new THREE.Vector3();
          for (let j = 0; j < positionAttribute.count; j++) {
            tempVertex.fromBufferAttribute(positionAttribute, j);
            localVertices.push(tempVertex.clone());
          }

          const indices = geometry.index;
          if (indices) {
            for (let k = 0; k < indices.count; k += 3) {
              processTriangleForSpotlight(localVertices[indices.getX(k)], localVertices[indices.getX(k + 1)], localVertices[indices.getX(k + 2)], worldMatrix);
            }
          } else {
            for (let k = 0; k < localVertices.length; k += 3) {
              processTriangleForSpotlight(localVertices[k], localVertices[k + 1], localVertices[k + 2], worldMatrix);
            }
          }
        });

        if (segmentsForThisCuttingPlane.length > 0) {
          finalSpotlightPaths.push(...segmentsForThisCuttingPlane.map(seg => [seg]));
        }
      }

      // TODO: Remaining steps:
      // - Implement the mesh triangle intersection and clipping logic.
      // - Consider intensity and falloff more deeply.
      
      if (finalSpotlightPaths.length === 0) {
        console.warn('No spotlight paths generated. Light params:', {
          position: lightPosition,
          target: lightTarget,
          direction: lightDirection,
          angle: spotAngleRad * 180 / Math.PI,
          intensity: light.intensity
        });
      } else {
        console.log('Generated spotlight paths:', finalSpotlightPaths.length);
        allHatchPaths.push(...finalSpotlightPaths);
      }
    } else if (light.type === 'point') {
      // TODO: Consider if point lights should also generate hatches (e.g. omni-directional hatching)
      console.warn('Point light hatching not yet implemented.');
    } else {
      console.warn(`Unsupported light type: ${light.type}`);
    }
  });

  return allHatchPaths;
}

/*
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
*/

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
      case 'spotlight':
        const spotLight = new THREE.SpotLight(lightColor);
        spotLight.position.set(lightData.position.x, lightData.position.y, lightData.position.z);
        spotLight.target.position.set(lightData.target.x, lightData.target.y, lightData.target.z);
        // Convert spotAngle from degrees to radians, default to 60 degrees if not set
        const spotAngleDegrees = lightData.spotAngle || 60;
        spotLight.angle = THREE.MathUtils.degToRad(spotAngleDegrees);
        spotLight.penumbra = 0.3; // Softer edges
        spotLight.decay = 1.5; // Moderate falloff
        spotLight.intensity = lightData.intensity; // Use original intensity
        spotLight.distance = 0; // No max distance
        console.log('Created spotlight:', {
          position: spotLight.position,
          target: spotLight.target.position,
          angle: spotLight.angle * 180 / Math.PI,
          intensity: spotLight.intensity
        });
        light = spotLight;

        // Mark the light target for selection and manipulation
        spotLight.target.userData = {
          id: `${lightData.id}-target`,
          parentLightId: lightData.id,
          isLightTarget: true,
          isHelper: false
        };

        // Mark the light target for selection and manipulation
        spotLight.target.userData = {
          id: `${lightData.id}-target`,
          parentLightId: lightData.id,
          isLightTarget: true,
          isHelper: false
        };

        let spotHelperColor = lightColor.clone().lerp(new THREE.Color(0xffffff), 0.5);
        if (spotHelperColor.getHSL({h:0,s:0,l:0}).l < 0.2) spotHelperColor.setHex(0x808080);
        if (spotHelperColor.getHSL({h:0,s:0,l:0}).l > 0.8) spotHelperColor.setHex(0x808080);

        helper = new THREE.SpotLightHelper(spotLight, spotHelperColor);
        helper.userData = {
          id: `${lightData.id}-helper`,
          parentLightId: lightData.id,
          isLightHelper: true,
          isHelper: true
        };
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
