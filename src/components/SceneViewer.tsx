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
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);


  const updateHatchVisuals = useCallback((paths: HatchPath[]) => {
    if (!sceneRef.current || !hatchLinesGroupRef.current) return;

    hatchLinesGroupRef.current.children.forEach(child => {
        if (child instanceof THREE.Line) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
        }
    });
    hatchLinesGroupRef.current.clear();

    let linePreviewColorHex = 0xffffff; // Default white (for dark themes)
    if (typeof window !== 'undefined') {
        const fgCssValue = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim();
        try {
            const parts = fgCssValue.split(' ');
            let colorString = fgCssValue;
            if (parts.length === 3 && parts[1].includes('%') && parts[2].includes('%')) {
                colorString = `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
            }
            linePreviewColorHex = new THREE.Color(colorString).getHex();
        } catch (e) {
            console.warn('Failed to parse --foreground for hatch lines, defaulting to white.', e);
        }
    }
    const material = new THREE.LineBasicMaterial({ color: linePreviewColorHex });

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
    if (!mountRef.current || typeof window === 'undefined') return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    
    const bgCssValue = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    let bgColorString = '#333333'; // Default fallback dark gray
    if (bgCssValue) {
      const parts = bgCssValue.split(' ');
      if (parts.length === 3 && parts[1].includes('%') && parts[2].includes('%')) {
        bgColorString = `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
      } else {
        bgColorString = bgCssValue; // Use as is if not H S L% format (e.g. hex)
      }
    }
    try {
        scene.background = new THREE.Color(bgColorString);
    } catch (e) {
        console.warn("Failed to parse --background for scene, defaulting to #333333", e);
        scene.background = new THREE.Color('#333333');
    }
    sceneRef.current = scene;
    
    hatchLinesGroupRef.current = new THREE.Group(); 
    scene.add(hatchLinesGroupRef.current);

    // Add Grid and Axes helpers
    const gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0x444444); // Grid size 10, 10 divisions, custom colors
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    const axesHelper = new THREE.AxesHelper(2); // Axis lines of length 2
    scene.add(axesHelper);
    axesHelperRef.current = axesHelper;


    const camera = new THREE.PerspectiveCamera(
      cameraState.fov,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
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
    controls.minDistance = 1;
    controls.maxDistance = 500;
    controls.addEventListener('change', () => {
        if (cameraRef.current && controlsRef.current) {
            updateCamera({
                position: { x: cameraRef.current.position.x, y: cameraRef.current.position.y, z: cameraRef.current.position.z },
                lookAt: { x: controlsRef.current.target.x, y: controlsRef.current.target.y, z: controlsRef.current.target.z }
            });
            setDirty(true); 
        }
    });
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
      requestAnimationFrame(animate);
      controlsRef.current?.update();
      lightHelpersRef.current.forEach(helper => helper.update());
      rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      controlsRef.current?.dispose();
      if (mountRef.current && rendererRef.current) {
         mountRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();

      if (gridHelperRef.current && sceneRef.current) {
        sceneRef.current.remove(gridHelperRef.current);
        gridHelperRef.current.dispose();
      }
      if (axesHelperRef.current && sceneRef.current) {
        sceneRef.current.remove(axesHelperRef.current);
        axesHelperRef.current.dispose();
      }

      sceneRef.current?.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      hatchLinesGroupRef.current?.traverse((object) => { 
        if (object instanceof THREE.Line) {
            object.geometry.dispose();
            (object.material as THREE.Material).dispose();
        }
      });
      lightHelpersRef.current.forEach(helper => {
        helper.dispose();
        if (helper.parent) helper.parent.remove(helper);
      });
      lightHelpersRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 


  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current) return;

    const objectsAndLightsToKeep = new Set<THREE.Object3D>();
    objectsAndLightsToKeep.add(cameraRef.current);
    if (hatchLinesGroupRef.current) objectsAndLightsToKeep.add(hatchLinesGroupRef.current);
    if (gridHelperRef.current) objectsAndLightsToKeep.add(gridHelperRef.current);
    if (axesHelperRef.current) objectsAndLightsToKeep.add(axesHelperRef.current);
    sceneRef.current.children.filter(child => child.userData.isAmbientLight).forEach(al => objectsAndLightsToKeep.add(al));


    const childrenToRemove = sceneRef.current.children.filter(child => !objectsAndLightsToKeep.has(child));
    childrenToRemove.forEach(child => {
      if (child instanceof THREE.Light) {
         // If it's a light with a target that was added to the scene, remove target too
        if (child.target && child.target.parent === sceneRef.current) {
            sceneRef.current!.remove(child.target);
        }
        // If it's a light that had a helper, remove helper
        const helper = lightHelpersRef.current.get(child.userData.id);
        if (helper) {
            if(helper.parent) helper.parent.remove(helper);
            helper.dispose();
            lightHelpersRef.current.delete(child.userData.id);
        }
      }
      sceneRef.current!.remove(child);
      // Dispose geometry/material if it's a mesh (though object meshes are handled below)
    });
    
    // Clear old light helpers specifically (if any were missed or lights were removed from context)
     lightHelpersRef.current.forEach((helper, id) => {
        if (!lights.find(l => l.id === id)) { // If light no longer exists in context
            if(helper.parent) helper.parent.remove(helper);
            helper.dispose();
            lightHelpersRef.current.delete(id);
        }
    });


    const objectMeshes = createObjectMeshes(objects);
    objectMeshes.forEach(mesh => sceneRef.current!.add(mesh));

    const lightSourceData = createLightSources(lights);
    lightSourceData.forEach(({light, helper}) => {
      sceneRef.current!.add(light);
      if (light.target && light.target instanceof THREE.Object3D) { 
          sceneRef.current!.add(light.target);
      }
      if (helper) {
        sceneRef.current!.add(helper);
        lightHelpersRef.current.set(light.userData.id, helper);
      }
    });
    
    if (!sceneRef.current.children.some(l => l instanceof THREE.AmbientLight || l.userData.isAmbientLight)) {
        const ambientLight = new THREE.AmbientLight(0x606060, 1); 
        ambientLight.userData.isAmbientLight = true; // Mark it so it's not removed with other lights
        sceneRef.current.add(ambientLight);
    }
    
    setDirty(true); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, lights]); 

   useEffect(() => {
    if (isDirty && cameraRef.current && sceneRef.current) {
      if (objects.length > 0 && lights.length > 0) {
        const newHatchLines = generateHatchLines(objects, lights, cameraRef.current);
        setHatchLines(newHatchLines);
      } else {
        setHatchLines([]); 
      }
      setDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, objects, lights, cameraState]); 

  useEffect(() => {
    updateHatchVisuals(hatchLines);
  }, [hatchLines, updateHatchVisuals]);


  useEffect(() => {
    if (cameraRef.current && controlsRef.current) {
      const newPos = new THREE.Vector3(cameraState.position.x, cameraState.position.y, cameraState.position.z);
      const newTarget = new THREE.Vector3(cameraState.lookAt.x, cameraState.lookAt.y, cameraState.lookAt.z);
      let needsProjectionUpdate = false;
      let needsViewUpdate = false;

      if (!cameraRef.current.position.equals(newPos)) {
        cameraRef.current.position.copy(newPos);
        needsViewUpdate = true;
      }
      if (!controlsRef.current.target.equals(newTarget)) {
        controlsRef.current.target.copy(newTarget);
        needsViewUpdate = true; // OrbitControls.update() will call camera.lookAt(controls.target)
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

      if (needsViewUpdate && controlsRef.current) {
        controlsRef.current.update(); // This ensures camera.lookAt is called if target changed
      }
      if (needsProjectionUpdate) {
        cameraRef.current.updateProjectionMatrix();
        setDirty(true); 
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraState]);


  return <div ref={mountRef} className="w-full h-full absolute top-0 left-0" />;
};

export default SceneViewer;

