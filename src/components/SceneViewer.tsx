// @ts-nocheck
// TODO: Fix THREE.js types
'use client';

import type { MutableRefObject} from 'react';
import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useScene } from '@/context/SceneContext';
import { generateHatchLines, createObjectMeshes, createLightSources } from '@/lib/three-utils';
import type { HatchPath } from '@/types';

const SceneViewer: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const { camera: cameraState, objects, lights, hatchLines, setHatchLines, isDirty, setDirty, updateCamera, updateObject, updateLight } = useScene();
  
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const hatchLinesGroupRef: MutableRefObject<THREE.Group | null> = useRef<THREE.Group | null>(null);
  const lightHelpersRef = useRef<Map<string, THREE.DirectionalLightHelper | THREE.SpotLightHelper | THREE.PointLightHelper>>(new Map());
  const objectMeshesRef = useRef<THREE.Mesh[]>([]); // Keep track of added object meshes
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D | null>(null);
  const [selectionType, setSelectionType] = useState<'object' | 'light' | 'lightTarget'>('object');
  const [selectionOutline, setSelectionOutline] = useState<THREE.LineSegments | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<{id: string, name: string} | null>(null);
  const [ghostMode, setGhostMode] = useState<boolean>(false);


  // Create a selection outline for the currently selected object
  const createSelectionOutline = useCallback((object: THREE.Object3D) => {
    if (!sceneRef.current) return null;
    
    // Remove any existing outline
    if (selectionOutline) {
      sceneRef.current.remove(selectionOutline);
      if (selectionOutline.geometry) selectionOutline.geometry.dispose();
      if (selectionOutline.material instanceof THREE.Material) {
        selectionOutline.material.dispose();
      } else if (Array.isArray(selectionOutline.material)) {
        selectionOutline.material.forEach(m => m.dispose());
      }
    }
    
    let geometry: THREE.BufferGeometry;
    
    if (object instanceof THREE.Mesh && object.geometry) {
      // For meshes, create an outline based on the mesh geometry
      const edgesGeometry = new THREE.EdgesGeometry(object.geometry);
      geometry = edgesGeometry;
    } else {
      // For lights and other objects, create a box outline
      const boxHelper = new THREE.BoxHelper(object);
      boxHelper.update();
      geometry = boxHelper.geometry;
    }
    
    // Create a bright outline material
    const material = new THREE.LineBasicMaterial({ 
      color: 0x00ffff, // Cyan color for visibility
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });
    
    const outline = new THREE.LineSegments(geometry, material);
    outline.position.copy(object.position);
    outline.rotation.copy(object.rotation);
    outline.scale.copy(object.scale);
    outline.userData = { isHelper: true };
    
    sceneRef.current.add(outline);
    return outline;
  }, [selectionOutline]);
  
  // Update the position of the selection outline
  const updateSelectionOutline = useCallback(() => {
    if (!selectedObject || !selectionOutline || !sceneRef.current) return;
    
    selectionOutline.position.copy(selectedObject.position);
    selectionOutline.rotation.copy(selectedObject.rotation);
    selectionOutline.scale.copy(selectedObject.scale);
    selectionOutline.updateMatrix();
  }, [selectedObject, selectionOutline]);
  
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

    // Create a more subtle grid helper
    const gridHelperColorCenter = new THREE.Color(`hsl(${getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim()})`);
    const gridHelperColorGrid = new THREE.Color(`hsl(${getComputedStyle(document.documentElement).getPropertyValue('--border').trim()})`);
    const gridHelper = new THREE.GridHelper(10, 10, gridHelperColorCenter, gridHelperColorGrid);
    
    // Make the grid more transparent
    if (gridHelper.material instanceof THREE.Material) {
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = 0.2;
    } else if (Array.isArray(gridHelper.material)) {
      gridHelper.material.forEach(mat => {
        mat.transparent = true;
        mat.opacity = 0.2;
      });
    }
    
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
    
    // Setup transform controls
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('dragging-changed', (event) => {
      // Disable orbit controls while using transform controls
      controls.enabled = !event.value;
      
      // If we've finished dragging, update the object position in the context
      if (!event.value && transformControls.object) {
        const object = transformControls.object;
        const objectId = object.userData.id;
        const position = object.position;
        
        if (selectionType === 'object') {
          // Update scene object
          const rotation = object.rotation;
          const scale = object.scale;
          
          updateObject(objectId, {
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
            scale: { x: scale.x, y: scale.y, z: scale.z }
          });
        } 
        else if (selectionType === 'light') {
          // Update light position
          updateLight(objectId, {
            position: { x: position.x, y: position.y, z: position.z }
          });
        } 
        else if (selectionType === 'lightTarget') {
          // Update light target
          // The userData.parentLightId contains the ID of the parent light
          const parentLightId = object.userData.parentLightId;
          if (parentLightId) {
            updateLight(parentLightId, {
              target: { x: position.x, y: position.y, z: position.z }
            });
          }
        }
        
        // Update selection outline position
        updateSelectionOutline();
        
        // Mark the scene as dirty to regenerate hatching
        setDirty(true);
      }
    });
    
    // Add transform controls to the scene
    scene.add(transformControls);
    transformControlsRef.current = transformControls;

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
    // First, identify existing lights and their helpers
    const existingLights = new Map();
    sceneRef.current.traverse(child => {
      if (child instanceof THREE.Light && child.userData && child.userData.id && !child.userData.isAmbientLight) {
        existingLights.set(child.userData.id, { 
          light: child, 
          helper: lightHelpersRef.current.get(child.userData.id) 
        });
      }
    });

    // Remove lights that are no longer in the lights array
    existingLights.forEach((value, id) => {
      if (!lights.some(l => l.id === id)) {
        sceneRef.current!.remove(value.light);
        if (value.helper) {
          sceneRef.current!.remove(value.helper);
          lightHelpersRef.current.delete(id);
        }
      }
    });

    // Add or update lights
    const newLightSources = createLightSources(lights);
    newLightSources.forEach(({ light, helper }, index) => {
      const lightData = lights[index];
      const existingLightAndHelper = existingLights.get(lightData.id);
      
      if (!existingLightAndHelper) {
        // Add new light and helper
        sceneRef.current!.add(light);
        if (helper) {
          sceneRef.current!.add(helper);
          lightHelpersRef.current.set(lightData.id, helper);
        }
      } else {
        // Update existing light
        const existingLight = existingLightAndHelper.light;
        const existingHelper = existingLightAndHelper.helper;
        
        if (existingLight instanceof THREE.DirectionalLight) {
          existingLight.position.set(lightData.position.x, lightData.position.y, lightData.position.z);
          existingLight.target.position.set(lightData.target.x, lightData.target.y, lightData.target.z);
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
      }
    });
    
    // Handle ambient light separately - ensure exactly one exists
    // First, find all ambient lights
    const ambientLights = [];
    sceneRef.current.traverse(child => {
      if (child instanceof THREE.AmbientLight || (child.userData && child.userData.isAmbientLight)) {
        ambientLights.push(child);
      }
    });
    
    // Remove all ambient lights except the first one (if any exist)
    if (ambientLights.length > 1) {
      console.log(`Found ${ambientLights.length} ambient lights, removing extras`);
      for (let i = 1; i < ambientLights.length; i++) {
        sceneRef.current.remove(ambientLights[i]);
      }
    }
    
    // Add an ambient light if none exists
    if (ambientLights.length === 0) {
      console.log('Adding ambient light');
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


  // Find a light in the scene by proximity to a point
  const findLightByProximity = useCallback((point: THREE.Vector3, maxDistance: number = 0.5): THREE.Light | null => {
    if (!sceneRef.current) return null;
    
    let closestLight: THREE.Light | null = null;
    let closestDistance = maxDistance;
    
    // Find all lights in the scene
    sceneRef.current.traverse(object => {
      if (object instanceof THREE.Light && object.userData && object.userData.isLight) {
        const distance = point.distanceTo(object.position);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestLight = object;
        }
      }
    });
    
    return closestLight;
  }, [sceneRef]);
  
  // Setup object selection with raycaster
  useEffect(() => {
    if (!mountRef.current || !sceneRef.current || !cameraRef.current) return;
    
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.2 }; // Make it easier to select lines
    const mouse = new THREE.Vector2();
    
    const handleMouseClick = (event: MouseEvent) => {
      // Calculate mouse position in normalized device coordinates
      const rect = mountRef.current!.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update the picking ray with the camera and mouse position
      raycaster.setFromCamera(mouse, cameraRef.current!);
      
      // First try to find lights by checking if the ray passes near any light position
      // This is needed because lights don't have geometry to intersect with
      const ray = raycaster.ray;
      const lightHelpers = [];
      
      // Collect all light helpers for special handling
      sceneRef.current!.traverse(object => {
        if (object.userData && (object.userData.isLightHelper || 
            (object.userData.parentLightId && object.type === 'LineSegments'))) {
          lightHelpers.push(object);
        }
      });
      
      // Check for intersections with light helpers first
      const helperIntersects = raycaster.intersectObjects(lightHelpers, true);
      if (helperIntersects.length > 0) {
        const helper = helperIntersects[0].object;
        const parentLightId = helper.userData.parentLightId;
        
        // Find the parent light
        let parentLight: THREE.Object3D | null = null;
        sceneRef.current!.traverse(object => {
          if (object.userData && object.userData.id === parentLightId) {
            parentLight = object;
          }
        });
        
        if (parentLight) {
          // Select the light
          if (transformControlsRef.current) {
            transformControlsRef.current.detach();
            transformControlsRef.current.attach(parentLight);
            setSelectedObject(parentLight);
            setSelectionType('light');
            setSelectionInfo({
              id: parentLightId,
              name: `Light (${parentLightId.split('-')[0]})`
            });
            
            // Create selection outline
            const outline = createSelectionOutline(parentLight);
            setSelectionOutline(outline);
            return;
          }
        }
      }
      
      // Find intersections with all objects in the scene
      const intersects = raycaster.intersectObjects(sceneRef.current!.children, true);
      
      // Filter out helper objects
      const validIntersects = intersects.filter(intersect => {
        return intersect.object.userData && 
               intersect.object.userData.id && 
               !intersect.object.userData.isHelper;
      });
      
      if (validIntersects.length > 0) {
        const hitObject = validIntersects[0].object;
        let objectToSelect: THREE.Object3D | null = null;
        let objectType: 'object' | 'light' | 'lightTarget' = 'object';
        let objectInfo = { id: '', name: '' };
        
        // Determine what kind of object we hit
        if (hitObject instanceof THREE.DirectionalLight || 
            hitObject.userData.isLight || 
            (hitObject.parent && hitObject.parent.userData && hitObject.parent.userData.isLight)) {
          // We hit a light or a light helper
          const lightObj = hitObject instanceof THREE.DirectionalLight ? 
                          hitObject : 
                          (hitObject.parent && hitObject.parent.userData && hitObject.parent.userData.isLight ? 
                           hitObject.parent : hitObject);
          
          objectToSelect = lightObj;
          objectType = 'light';
          objectInfo = { 
            id: lightObj.userData.id, 
            name: `Light (${lightObj.userData.id.split('-')[0]})` 
          };
        } 
        else if (hitObject.userData.isLightTarget || 
                (hitObject.parent && hitObject.parent.userData && hitObject.parent.userData.isLightTarget)) {
          // We hit a light target
          const targetObj = hitObject.userData.isLightTarget ? 
                           hitObject : 
                           hitObject.parent;
          
          objectToSelect = targetObj;
          objectType = 'lightTarget';
          objectInfo = { 
            id: targetObj.userData.parentLightId, 
            name: `Light Target (${targetObj.userData.parentLightId.split('-')[0]})` 
          };
        }
        else {
          // We hit a regular scene object
          objectToSelect = hitObject;
          objectType = 'object';
          objectInfo = { 
            id: hitObject.userData.id, 
            name: `${hitObject.userData.type || 'Object'} (${hitObject.userData.id.split('-')[0]})` 
          };
        }
        
        // Attach transform controls to the selected object
        if (transformControlsRef.current && objectToSelect) {
          transformControlsRef.current.detach(); // Detach from any previous object
          transformControlsRef.current.attach(objectToSelect);
          setSelectedObject(objectToSelect);
          setSelectionType(objectType);
          setSelectionInfo(objectInfo);
          
          // Create selection outline
          const outline = createSelectionOutline(objectToSelect);
          setSelectionOutline(outline);
        }
      } else {
        // Try to find a light by proximity to the ray
        const rayPoint = ray.at(5, new THREE.Vector3()); // Get a point 5 units along the ray
        const nearbyLight = findLightByProximity(rayPoint, 0.5);
        
        if (nearbyLight) {
          // We found a light near the ray
          if (transformControlsRef.current) {
            transformControlsRef.current.detach();
            transformControlsRef.current.attach(nearbyLight);
            setSelectedObject(nearbyLight);
            setSelectionType('light');
            setSelectionInfo({
              id: nearbyLight.userData.id,
              name: `Light (${nearbyLight.userData.id.split('-')[0]})`
            });
            
            // Create selection outline
            const outline = createSelectionOutline(nearbyLight);
            setSelectionOutline(outline);
          }
        } else {
          // Clicked on empty space, detach transform controls
          if (transformControlsRef.current) {
            transformControlsRef.current.detach();
            setSelectedObject(null);
            setSelectionType('object');
            setSelectionInfo(null);
            
            // Remove selection outline
            if (selectionOutline && sceneRef.current) {
              sceneRef.current.remove(selectionOutline);
              if (selectionOutline.geometry) selectionOutline.geometry.dispose();
              if (selectionOutline.material instanceof THREE.Material) {
                selectionOutline.material.dispose();
              }
              setSelectionOutline(null);
            }
          }
        }
      }
    };
    
    // Add click event listener
    mountRef.current.addEventListener('click', handleMouseClick);
    
    // Cleanup
    return () => {
      if (mountRef.current) {
        mountRef.current.removeEventListener('click', handleMouseClick);
      }
    };
  }, [createSelectionOutline, selectionOutline, findLightByProximity]);
  
  // Add keyboard shortcuts for transform controls and ghost mode
  useEffect(() => {
    if (!transformControlsRef.current) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Transform controls shortcuts
      if (selectedObject && transformControlsRef.current) {
        switch (event.key.toLowerCase()) {
          case 't': // Translate mode
            transformControlsRef.current.setMode('translate');
            break;
          case 'r': // Rotate mode
            transformControlsRef.current.setMode('rotate');
            break;
          case 's': // Scale mode
            transformControlsRef.current.setMode('scale');
            break;
        }
      }
      
      // Ghost mode toggle with 'G' key
      if (event.key.toLowerCase() === 'g') {
        toggleGhostMode();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedObject]);
  
  // Toggle ghost mode (transparent objects)
  const toggleGhostMode = useCallback(() => {
    setGhostMode(prev => {
      const newGhostMode = !prev;
      
      // Update all object materials
      if (sceneRef.current) {
        sceneRef.current.traverse(object => {
          if (object instanceof THREE.Mesh && !object.userData.isHelper) {
            if (object.material instanceof THREE.Material) {
              object.material.transparent = newGhostMode;
              object.material.opacity = newGhostMode ? 0.3 : 1.0;
              object.material.depthWrite = !newGhostMode;
              object.material.needsUpdate = true;
            } else if (Array.isArray(object.material)) {
              object.material.forEach(mat => {
                mat.transparent = newGhostMode;
                mat.opacity = newGhostMode ? 0.3 : 1.0;
                mat.depthWrite = !newGhostMode;
                mat.needsUpdate = true;
              });
            }
          }
        });
      }
      
      return newGhostMode;
    });
  }, [sceneRef]);
  
  // Function to toggle between light and light target when a light is selected
  const toggleLightTargetSelection = useCallback(() => {
    if (!selectedObject || !sceneRef.current || !transformControlsRef.current) return;
    
    if (selectionType === 'light') {
      // Find the light target
      const light = selectedObject as THREE.DirectionalLight;
      if (light.target) {
        // Switch to the target
        transformControlsRef.current.detach();
        transformControlsRef.current.attach(light.target);
        setSelectedObject(light.target);
        setSelectionType('lightTarget');
        setSelectionInfo({
          id: light.userData.id,
          name: `Light Target (${light.userData.id.split('-')[0]})`
        });
        
        // Update selection outline
        const outline = createSelectionOutline(light.target);
        setSelectionOutline(outline);
      }
    } 
    else if (selectionType === 'lightTarget') {
      // Find the parent light
      const target = selectedObject;
      const parentLightId = target.userData.parentLightId;
      
      if (parentLightId) {
        // Find the parent light in the scene
        let parentLight: THREE.Object3D | null = null;
        sceneRef.current.traverse((object) => {
          if (object.userData && object.userData.id === parentLightId) {
            parentLight = object;
          }
        });
        
        if (parentLight) {
          // Switch to the light
          transformControlsRef.current.detach();
          transformControlsRef.current.attach(parentLight);
          setSelectedObject(parentLight);
          setSelectionType('light');
          setSelectionInfo({
            id: parentLightId,
            name: `Light (${parentLightId.split('-')[0]})`
          });
          
          // Update selection outline
          const outline = createSelectionOutline(parentLight);
          setSelectionOutline(outline);
        }
      }
    }
  }, [selectedObject, selectionType, createSelectionOutline, sceneRef]);
  
  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full absolute top-0 left-0" />
      
      {/* Controls UI */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        {/* Ghost Mode Toggle */}
        <div className="bg-background/80 backdrop-blur-sm border rounded-md p-2 shadow-md">
          <button 
            onClick={toggleGhostMode}
            className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${ghostMode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            title="Toggle Ghost Mode (G)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
            </svg>
            {ghostMode ? 'Ghost Mode On' : 'Ghost Mode Off'}
          </button>
        </div>
        
        {/* Selection Info UI */}
        {selectionInfo && (
          <div className="bg-background/80 backdrop-blur-sm border rounded-md p-2 shadow-md flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-400" />
              <span className="text-sm font-medium">{selectionInfo.name}</span>
            </div>
            
            {/* Transform mode indicators */}
            <div className="flex gap-1 text-xs">
              <span className="px-1 py-0.5 rounded bg-muted">T: Translate</span>
              <span className="px-1 py-0.5 rounded bg-muted">R: Rotate</span>
              <span className="px-1 py-0.5 rounded bg-muted">S: Scale</span>
            </div>
            
            {/* Toggle button for lights */}
            {(selectionType === 'light' || selectionType === 'lightTarget') && (
              <button 
                onClick={toggleLightTargetSelection}
                className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                {selectionType === 'light' ? 'Edit Target' : 'Edit Light'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SceneViewer;
