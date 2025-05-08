// @ts-nocheck
// TODO: Fix THREE.js types
'use client';

import type { MutableRefObject} from 'react';
import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useScene } from '@/context/SceneContext';
import { generateHatchLines, createObjectMeshes, createLightSources } from '@/lib/three-utils';
import type { HatchPath } from '@/types';

const SceneViewer: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const { camera: cameraState, objects, lights, hatchLines, setHatchLines, isDirty, setDirty, updateCamera } = useScene();
  
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const hatchLinesGroupRef: MutableRefObject<THREE.Group | null> = useRef<THREE.Group | null>(null);
  const lightHelpersRef = useRef<Map<string, THREE.DirectionalLightHelper | THREE.SpotLightHelper | THREE.PointLightHelper>>(new Map());
  const objectMeshesRef = useRef<THREE.Mesh[]>([]); // Keep track of added object meshes
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);


  const updateHatchVisuals = useCallback((paths: HatchPath[]) => {
    if (!sceneRef.current || !hatchLinesGroupRef.current) return;

    // Dispose old lines
    hatchLinesGroupRef.current.children.forEach(child => {
        if (child instanceof THREE.Line) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
                 (child.material as THREE.Material).dispose();
            } else if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            }
        }
    });
    hatchLinesGroupRef.current.clear(); // Remove all children

    let linePreviewColorHex = 0xffffff; 
    if (typeof window !== 'undefined') {
        const fgCssValue = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim();
        try {
            const parts = fgCssValue.split(' ');
            let colorString = fgCssValue;
            if (parts.length === 3 && parts[1].endsWith('%') && parts[2].endsWith('%')) {
                colorString = `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
            }
            linePreviewColorHex = new THREE.Color(colorString).getHex();
        } catch (e) {
            console.warn('Failed to parse --foreground for hatch lines, defaulting to white.', e);
        }
    }
    const material = new THREE.LineBasicMaterial({ color: linePreviewColorHex, linewidth: 0.5 }); // Thinner lines

    paths.forEach(path => {
      if (path.length > 0) {
        const points = [];
        path.forEach((segment, segmentIndex) => {
            if (segmentIndex === 0) { 
                 points.push(new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z));
            }
            points.push(new THREE.Vector3(segment.end.x, segment.end.y, segment.end.z));
        });
        
        if (points.length >= 2) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, material);
            hatchLinesGroupRef.current!.add(line);
        }
      }
    });
  }, []);


  useEffect(() => {
    if (!mountRef.current || typeof window === 'undefined' || rendererRef.current) return; // Prevent re-initialization

    console.log('SceneViewer initializing Three.js');
    const currentMount = mountRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    
    const bgCssValue = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    let bgColorString = 'hsl(var(--background))';
    try {
        const parts = bgCssValue.split(' ');
        if (parts.length === 3 && parts[1].endsWith('%') && parts[2].endsWith('%')) {
             bgColorString = `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
        } else {
            bgColorString = bgCssValue; // Use as is if not H S L% format
        }
        scene.background = new THREE.Color(bgColorString);
    } catch (e) {
        console.warn("Failed to parse --background for scene, defaulting to dark gray", e);
        scene.background = new THREE.Color(0x282c34); // A common dark editor background
    }
    sceneRef.current = scene;
    
    hatchLinesGroupRef.current = new THREE.Group(); 
    scene.add(hatchLinesGroupRef.current);

    const gridHelperColorCenter = new THREE.Color(`hsl(${getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim()})`);
    const gridHelperColorGrid = new THREE.Color(`hsl(${getComputedStyle(document.documentElement).getPropertyValue('--border').trim()})`);
    const gridHelper = new THREE.GridHelper(10, 10, gridHelperColorCenter, gridHelperColorGrid); 
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    const axesHelper = new THREE.AxesHelper(2); 
    scene.add(axesHelper);
    axesHelperRef.current = axesHelper;


    const camera = new THREE.PerspectiveCamera(
      cameraState.fov,
      currentMount.clientWidth / currentMount.clientHeight,
      cameraState.near,
      cameraState.far
    );
    camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
    camera.lookAt(new THREE.Vector3(cameraState.lookAt.x, cameraState.lookAt.y, cameraState.lookAt.z));
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cameraState.lookAt.x, cameraState.lookAt.y, cameraState.lookAt.z);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = false;
    controls.minDistance = 0.5; // Allow closer zoom
    controls.maxDistance = 100; // Reduce max distance
    const onControlsChange = () => {
        if (cameraRef.current && controlsRef.current) {
            updateCamera({
                position: { x: cameraRef.current.position.x, y: cameraRef.current.position.y, z: cameraRef.current.position.z },
                lookAt: { x: controlsRef.current.target.x, y: controlsRef.current.target.y, z: controlsRef.current.target.z }
            });
            // setDirty(true); // Removed, as dirty is set by cameraState change now
        }
    };
    controls.addEventListener('change', onControlsChange);
    controlsRef.current = controls;

    const handleResize = () => {
      if (mountRef.current && rendererRef.current && cameraRef.current) {
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        rendererRef.current.setSize(width, height);
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        setDirty(true); 
      }
    };
    window.addEventListener('resize', handleResize);

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      controlsRef.current?.update();
      lightHelpersRef.current.forEach(helper => helper.update());
      rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
    };
    animate();

    return () => {
      console.log('SceneViewer unmounting');
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('change', onControlsChange);


      if (gridHelperRef.current && sceneRef.current) {
        sceneRef.current.remove(gridHelperRef.current);
        gridHelperRef.current.geometry.dispose();
        (gridHelperRef.current.material as THREE.Material).dispose();
        gridHelperRef.current = null;
      }
      if (axesHelperRef.current && sceneRef.current) {
        sceneRef.current.remove(axesHelperRef.current);
        axesHelperRef.current.geometry.dispose();
        (axesHelperRef.current.material as THREE.Material).dispose();
        axesHelperRef.current = null;
      }
      
      // Dispose hatch lines
      hatchLinesGroupRef.current?.traverse((object) => {
        if (object instanceof THREE.Line) {
            object.geometry.dispose();
             if (object.material instanceof THREE.Material) {
                 (object.material as THREE.Material).dispose();
            } else if (Array.isArray(object.material)) {
                object.material.forEach(m => m.dispose());
            }
        }
      });
       if (hatchLinesGroupRef.current && sceneRef.current) {
         sceneRef.current.remove(hatchLinesGroupRef.current);
       }
       hatchLinesGroupRef.current = null;


      // Dispose object meshes
      objectMeshesRef.current.forEach(mesh => {
        if (sceneRef.current) sceneRef.current.remove(mesh);
        mesh.geometry.dispose();
         if (mesh.material instanceof THREE.Material) {
             (mesh.material as THREE.Material).dispose();
        } else if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
        }
      });
      objectMeshesRef.current = [];

      // Dispose lights and their helpers
      lightHelpersRef.current.forEach((helper, id) => {
        if (sceneRef.current) {
            sceneRef.current.remove(helper);
            const lightSource = sceneRef.current.getObjectByProperty('userData.id', id) as THREE.Light;
            if (lightSource) {
                sceneRef.current.remove(lightSource);
                if (lightSource.target && lightSource.target.parent === sceneRef.current) {
                    sceneRef.current.remove(lightSource.target);
                }
                // THREE.Light itself does not have a dispose method.
            }
        }
        helper.dispose();
      });
      lightHelpersRef.current.clear();

       // Remove remaining lights (like ambient)
       if (sceneRef.current) {
           const lightsToRemove = sceneRef.current.children.filter(child => child.isLight);
           lightsToRemove.forEach(light => sceneRef.current!.remove(light));
       }


      controlsRef.current?.dispose();
      controlsRef.current = null;

      if (rendererRef.current && currentMount && currentMount.contains(rendererRef.current.domElement)) {
         currentMount.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
      rendererRef.current = null;

      sceneRef.current = null; 
      cameraRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount and unmount


  // Effect for updating objects and lights in the scene
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current) return;
    console.log("Updating objects and lights", objects, lights);

    // --- Object Management ---
    // Remove old object meshes not present in current `objects` state
    const currentObjectIds = new Set(objects.map(o => o.id));
    const meshesToRemove = objectMeshesRef.current.filter(mesh => !currentObjectIds.has(mesh.userData.id));
    meshesToRemove.forEach(mesh => {
        sceneRef.current!.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
        else (mesh.material as THREE.Material).dispose();
    });
    objectMeshesRef.current = objectMeshesRef.current.filter(mesh => currentObjectIds.has(mesh.userData.id));

    // Add new or update existing object meshes
    const existingMeshIds = new Set(objectMeshesRef.current.map(m => m.userData.id));
    objects.forEach(objData => {
        if (!existingMeshIds.has(objData.id)) {
            const newMesh = createObjectMeshes([objData])[0];
            sceneRef.current!.add(newMesh);
            objectMeshesRef.current.push(newMesh);
        } else {
            // Update existing mesh (more complex, for now just recreating if params change significantly)
            // For simplicity here, we assume if an object is in `objects` list, it's either new or its properties are up-to-date for hatching.
            // A more robust update would diff properties and update THREE.Mesh properties.
        }
    });


    // --- Light Management ---
    // Remove old lights and helpers not in current `lights` state
    const currentLightIds = new Set(lights.map(l => l.id));
    sceneRef.current.children.slice().forEach(child => {
        if (child.userData.id && child.isLight && !currentLightIds.has(child.userData.id)) {
            sceneRef.current!.remove(child);
            if (child.target && child.target.parent === sceneRef.current) {
                sceneRef.current!.remove(child.target);
            }
            const helper = lightHelpersRef.current.get(child.userData.id);
            if (helper) {
                sceneRef.current!.remove(helper);
                helper.dispose();
                lightHelpersRef.current.delete(child.userData.id);
            }
        }
    });
    
    // Add new or update existing lights
    lights.forEach(lightData => {
        let existingLight = sceneRef.current!.getObjectByProperty('userData.id', lightData.id) as THREE.Light;
        let existingHelper = lightHelpersRef.current.get(lightData.id);

        if (!existingLight) {
            const {light: newLight, helper: newHelper} = createLightSources([lightData])[0];
            sceneRef.current!.add(newLight);
            if (newLight.target && newLight.target instanceof THREE.Object3D) {
                sceneRef.current!.add(newLight.target);
            }
            if (newHelper) {
                sceneRef.current!.add(newHelper);
                lightHelpersRef.current.set(newLight.userData.id, newHelper);
            }
        } else {
            // Update existing light properties
            existingLight.color.set(lightData.color);
            // For directional lights
            if (existingLight instanceof THREE.DirectionalLight) {
                existingLight.position.set(lightData.position.x, lightData.position.y, lightData.position.z);
                existingLight.target.position.set(lightData.target.x, lightData.target.y, lightData.target.z);
            }
            existingLight.userData.hatchAngle = lightData.hatchAngle;
            existingLight.userData.originalIntensity = lightData.intensity;


            if (existingHelper) {
                existingHelper.update(); // Update helper if light changes
                 if(existingHelper.parent !== sceneRef.current) { // If helper got detached somehow
                    sceneRef.current!.add(existingHelper);
                }
            } else { // If helper didn't exist but light did, create and add helper
                 const {helper: newHelperInstance} = createLightSources([lightData])[0];
                 if (newHelperInstance) {
                     sceneRef.current!.add(newHelperInstance);
                     lightHelpersRef.current.set(lightData.id, newHelperInstance);
                 }
            }
        }
    });
    
    // Ensure one ambient light for basic visibility
    if (!sceneRef.current.children.some(l => l instanceof THREE.AmbientLight || l.userData.isAmbientLight)) {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // Dim ambient light
        ambientLight.userData.isAmbientLight = true; 
        sceneRef.current.add(ambientLight);
    }
    
    setDirty(true); // Trigger hatch line regeneration
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, lights]); // Re-run when objects or lights array references change


   // Effect for generating and updating hatch lines
   useEffect(() => {
    if (isDirty && cameraRef.current && sceneRef.current) {
      console.log("Regenerating hatch lines...");
      if (objects.length > 0 && lights.length > 0) {
        const newHatchLines = generateHatchLines(objectMeshesRef.current, lights, cameraRef.current); // Pass meshes directly
        setHatchLines(newHatchLines);
      } else {
        setHatchLines([]); 
      }
      setDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, objects, lights, cameraState]); // Note: cameraState change will setDirty, triggering this.

  useEffect(() => {
    updateHatchVisuals(hatchLines);
  }, [hatchLines, updateHatchVisuals]);


  // Effect for updating camera from context state
  useEffect(() => {
    if (cameraRef.current && controlsRef.current) {
      const newPos = new THREE.Vector3(cameraState.position.x, cameraState.position.y, cameraState.position.z);
      const newTarget = new THREE.Vector3(cameraState.lookAt.x, cameraState.lookAt.y, cameraState.lookAt.z);
      let needsProjectionUpdate = false;
      let needsControlsUpdate = false;

      if (!cameraRef.current.position.equals(newPos)) {
        cameraRef.current.position.copy(newPos);
        needsControlsUpdate = true; 
      }
      if (!controlsRef.current.target.equals(newTarget)) {
        controlsRef.current.target.copy(newTarget);
        needsControlsUpdate = true;
      }

      if (cameraRef.current.fov !== cameraState.fov) {
        cameraRef.current.fov = cameraState.fov;
        needsProjectionUpdate = true;
      }
      if (cameraRef.current.near !== cameraState.near) {
        cameraRef.current.near = cameraState.near;
        needsProjectionUpdate = true;
      }
      if (cameraRef.current.far !== cameraState.far) {
        cameraRef.current.far = cameraState.far;
        needsProjectionUpdate = true;
      }

      if (needsControlsUpdate && controlsRef.current) {
        controlsRef.current.update(); 
      }
      if (needsProjectionUpdate) {
        cameraRef.current.updateProjectionMatrix();
      }
      // If any camera parameter changed, we might need to regenerate hatches
      if (needsControlsUpdate || needsProjectionUpdate) {
        setDirty(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraState]);


  return <div ref={mountRef} className="w-full h-full absolute top-0 left-0" />;
};

export default SceneViewer;
