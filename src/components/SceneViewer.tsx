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
        path.forEach(segment => {
            // For continuous path, only add start for the first segment or if it's a new sub-path
            if (points.length === 0 || !new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z).equals(points[points.length -1])) {
                 points.push(new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z));
            }
            points.push(new THREE.Vector3(segment.end.x, segment.end.y, segment.end.z));
        });
        
        if (points.length >= 2) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: 0xffffff }); // White lines for black paper
            const line = new THREE.Line(geometry, material);
            hatchLinesRef.current!.add(line);
        }
      }
    });
  }, []);


  useEffect(() => {
    if (!mountRef.current || typeof window === 'undefined') return;

    // Initialize renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333); // Dark gray background
    sceneRef.current = scene;
    
    // Initialize hatch lines group
    hatchLinesRef.current = new THREE.Group();
    scene.add(hatchLinesRef.current);

    // Initialize camera
    const camera = new THREE.PerspectiveCamera(
      cameraState.fov,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      cameraState.near,
      cameraState.far
    );
    camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
    camera.lookAt(new THREE.Vector3(cameraState.lookAt.x, cameraState.lookAt.y, cameraState.lookAt.z));
    cameraRef.current = camera;

    // Initialize controls
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
        }
    });
    controlsRef.current = controls;

    // Handle resize
    const handleResize = () => {
      if (mountRef.current && rendererRef.current && cameraRef.current) {
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        rendererRef.current.setSize(width, height);
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
      }
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controlsRef.current?.update();
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

      // Dispose scene objects and materials
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
    };
  }, [cameraState.fov, cameraState.near, cameraState.far, updateCamera]);


  // Update objects and lights in the scene
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current) return;

    // Clear existing objects and lights (except camera and hatch group)
    const objectsToRemove = sceneRef.current.children.filter(
      child => !(child instanceof THREE.Camera) && child !== hatchLinesRef.current && !(child instanceof THREE.AmbientLight && child.userData.id === undefined) // Keep default ambient if present
    );
    objectsToRemove.forEach(child => sceneRef.current!.remove(child));

    // Add new objects
    const objectMeshes = createObjectMeshes(objects);
    objectMeshes.forEach(mesh => sceneRef.current!.add(mesh));

    // Add new lights (actual THREE.Light for scene illumination, not for hatching logic directly)
    const lightSources = createLightSources(lights);
    lightSources.forEach(light => sceneRef.current!.add(light));
    
    // Add a general ambient light to make objects visible even without specific lights
    if (!sceneRef.current.children.some(l => l instanceof THREE.AmbientLight)) {
        const ambientLight = new THREE.AmbientLight(0x404040, 1); // Soft white light
        sceneRef.current.add(ambientLight);
    }
    
    setDirty(true); // Mark scene as dirty to recalculate hatches
  }, [objects, lights, setDirty]);

  // Recalculate and update hatch lines when scene is dirty or camera perspective changes
   useEffect(() => {
    if (isDirty && cameraRef.current && objects.length > 0 && lights.length > 0) {
      const newHatchLines = generateHatchLines(objects, lights, cameraRef.current);
      setHatchLines(newHatchLines);
      setDirty(false);
    }
  }, [isDirty, objects, lights, cameraState, setHatchLines, setDirty]);

  // Update visual representation of hatch lines when hatchLines data changes
  useEffect(() => {
    updateHatchVisuals(hatchLines);
  }, [hatchLines, updateHatchVisuals]);


  // Update camera position and lookAt from context
  useEffect(() => {
    if (cameraRef.current && controlsRef.current) {
      const newPos = new THREE.Vector3(cameraState.position.x, cameraState.position.y, cameraState.position.z);
      const newTarget = new THREE.Vector3(cameraState.lookAt.x, cameraState.lookAt.y, cameraState.lookAt.z);

      if (!cameraRef.current.position.equals(newPos)) {
        cameraRef.current.position.copy(newPos);
      }
      if (!controlsRef.current.target.equals(newTarget)) {
        controlsRef.current.target.copy(newTarget);
      }
    }
  }, [cameraState.position, cameraState.lookAt]);


  return <div ref={mountRef} className="w-full h-full absolute top-0 left-0" />;
};

export default SceneViewer;
