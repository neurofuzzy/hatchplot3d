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
  const hatchLinesRef: MutableRefObject<THREE.Group | null> = useRef<THREE.Group | null>(null);
  const lightHelpersRef = useRef<Map<string, THREE.LightHelper>>(new Map());


  const updateHatchVisuals = useCallback((paths: HatchPath[]) => {
    if (!sceneRef.current || !hatchLinesRef.current) return;

    // Clear previous hatch lines
    hatchLinesRef.current.children.forEach(child => {
        if (child instanceof THREE.Line) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
        }
    });
    hatchLinesRef.current.clear();

    paths.forEach(path => {
      if (path.length > 0) {
        const points = [];
        path.forEach((segment, segmentIndex) => {
            if (segmentIndex === 0) { // Start of a new polyline
                 points.push(new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z));
            }
            points.push(new THREE.Vector3(segment.end.x, segment.end.y, segment.end.z));
        });
        
        if (points.length >= 2) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: 0xffffff }); // White lines for dark paper
            const line = new THREE.Line(geometry, material);
            hatchLinesRef.current!.add(line);
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
    scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || '#333333');
    sceneRef.current = scene;
    
    hatchLinesRef.current = new THREE.Group();
    scene.add(hatchLinesRef.current);

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
            // Moving camera implies hatch lines might need recalculation if view-dependent
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
        setDirty(true); // Aspect ratio change might affect hatching
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
      hatchLinesRef.current?.traverse((object) => {
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
  }, []); // Only run on mount and unmount


  // Update objects and lights in the scene
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current) return;

    // Clear existing objects, lights, and their helpers (except camera and hatch group)
    const objectsToRemove = sceneRef.current.children.filter(
      child => !(child instanceof THREE.Camera) && 
               child !== hatchLinesRef.current && 
               !(child.userData.isAmbientLight) && // Keep default ambient if present
               !(child instanceof THREE.LightHelper) // Remove old helpers
    );
    objectsToRemove.forEach(child => {
        if (child instanceof THREE.Light && child.target && child.target.parent === sceneRef.current) {
            sceneRef.current!.remove(child.target); // Remove target if it was added
        }
        sceneRef.current!.remove(child)
    });

    // Dispose and clear old light helpers
    lightHelpersRef.current.forEach(helper => {
        helper.dispose();
        if (helper.parent) helper.parent.remove(helper);
    });
    lightHelpersRef.current.clear();

    // Add new objects
    const objectMeshes = createObjectMeshes(objects);
    objectMeshes.forEach(mesh => sceneRef.current!.add(mesh));

    // Add new lights and their helpers
    const lightSourceData = createLightSources(lights);
    lightSourceData.forEach(({light, helper}) => {
      sceneRef.current!.add(light);
      if (light.target && light.target instanceof THREE.Object3D) { // Add target to scene for DirectionalLight
          sceneRef.current!.add(light.target);
      }
      if (helper) {
        sceneRef.current!.add(helper);
        lightHelpersRef.current.set(light.userData.id, helper);
      }
    });
    
    // Add a general ambient light if no other lights provide ambient illumination
    if (!sceneRef.current.children.some(l => l instanceof THREE.AmbientLight)) {
        const ambientLight = new THREE.AmbientLight(0x606060, 1); // Soft white light
        ambientLight.userData.isAmbientLight = true;
        sceneRef.current.add(ambientLight);
    }
    
    setDirty(true); // Mark scene as dirty to recalculate hatches
  }, [objects, lights, setDirty]);

  // Recalculate and update hatch lines when scene is dirty or camera perspective changes
   useEffect(() => {
    if (isDirty && cameraRef.current && sceneRef.current) {
      if (objects.length > 0 && lights.length > 0) {
        const newHatchLines = generateHatchLines(objects, lights, cameraRef.current);
        setHatchLines(newHatchLines);
      } else {
        setHatchLines([]); // Clear hatches if no objects or lights
      }
      setDirty(false);
    }
  }, [isDirty, objects, lights, cameraState, setHatchLines, setDirty, sceneRef]);

  // Update visual representation of hatch lines when hatchLines data changes
  useEffect(() => {
    updateHatchVisuals(hatchLines);
  }, [hatchLines, updateHatchVisuals]);


  // Update camera position, lookAt, fov, near, far from context
  useEffect(() => {
    if (cameraRef.current && controlsRef.current) {
      const newPos = new THREE.Vector3(cameraState.position.x, cameraState.position.y, cameraState.position.z);
      const newTarget = new THREE.Vector3(cameraState.lookAt.x, cameraState.lookAt.y, cameraState.lookAt.z);
      let needsProjectionUpdate = false;

      if (!cameraRef.current.position.equals(newPos)) {
        cameraRef.current.position.copy(newPos);
      }
      if (!controlsRef.current.target.equals(newTarget)) {
        controlsRef.current.target.copy(newTarget);
        // OrbitControls.update() will call camera.lookAt(controls.target)
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

      if (needsProjectionUpdate) {
        cameraRef.current.updateProjectionMatrix();
        setDirty(true); // Camera projection change requires hatch regeneration
      }
    }
  }, [cameraState, setDirty]);


  return <div ref={mountRef} className="w-full h-full absolute top-0 left-0" />;
};

export default SceneViewer;
