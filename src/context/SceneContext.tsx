
'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { SceneState, SceneLight, SceneObject, CameraState, SceneContextType, HatchPath } from '@/types';
import { v4 as uuidv4 } from 'uuid'; 

const defaultCameraState: CameraState = {
  position: { x: 2.5, y: 2, z: 5 }, // Closer and slightly higher
  lookAt: { x: 0.5, y: 0.25, z: 0 }, // More centered on the initial objects
  fov: 50,
  near: 0.1,
  far: 100, // Reduced far plane for typical scenes
};

const initialBoxId = 'initial-box-static';
const initialSphereId = 'initial-sphere-static';
const initialLightId = 'initial-light-static';


const SceneContext = createContext<SceneContextType | undefined>(undefined);

export const SceneProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);


  const getInitialState = useCallback((): SceneState => {
    const initialBox: SceneObject = {
      id: initialBoxId, 
      type: 'box',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#cccccc',
      geometryParams: { width: 1, height: 1, depth: 1 },
    };

    const initialSphere: SceneObject = {
      id: initialSphereId, 
      type: 'sphere',
      position: { x: 1.5, y: 0.5, z: -0.5 }, // Adjusted position for better initial view
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.75, y: 0.75, z: 0.75 }, // Slightly smaller sphere
      color: '#aaaaaa',
      geometryParams: { radius: 0.5 },
    };

    const initialLight: SceneLight = {
      id: initialLightId, 
      type: 'directional',
      position: { x: 2, y: 3, z: 2.5 }, // Adjusted light position
      target: { x: 0.5, y: 0, z: 0 }, // Light target towards objects
      color: '#ffffff',
      intensity: 0.9, 
      hatchAngle: 45, 
      castShadow: true, // This flag is more for conceptual lighting, not directly for SVG
    };
    return {
      lights: [initialLight],
      objects: [initialBox, initialSphere],
      camera: defaultCameraState,
      hatchLines: [],
      isDirty: true,
    };
  }, []);

  const [sceneState, setSceneState] = useState<SceneState>(getInitialState());
  
  // Re-initialize state on client mount to ensure consistency if needed,
  // though static IDs should mostly handle this.
  useEffect(() => {
    if (isClient) {
        setSceneState(getInitialState());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]);


  const setDirty = useCallback((dirty: boolean) => {
    setSceneState(prev => ({ ...prev, isDirty: dirty }));
  }, []);

  const addLight = useCallback((lightData: Omit<SceneLight, 'id' | 'castShadow'>) => {
    const newLight: SceneLight = { ...lightData, id: uuidv4(), castShadow: true }; 
    setSceneState(prev => ({ ...prev, lights: [...prev.lights, newLight], isDirty: true }));
  }, []);

  const removeLight = useCallback((lightId: string) => {
    setSceneState(prev => ({ ...prev, lights: prev.lights.filter(l => l.id !== lightId), isDirty: true }));
  }, []);

  const updateLight = useCallback((lightId: string, updates: Partial<SceneLight>) => {
    setSceneState(prev => ({
      ...prev,
      lights: prev.lights.map(l => (l.id === lightId ? { ...l, ...updates } : l)),
      isDirty: true,
    }));
  }, []);

  const addObject = useCallback((objectData: Omit<SceneObject, 'id'>) => {
    const newObject: SceneObject = { ...objectData, id: uuidv4() }; 
    setSceneState(prev => ({ ...prev, objects: [...prev.objects, newObject], isDirty: true }));
  }, []);
  
  const removeObject = useCallback((objectId: string) => {
    setSceneState(prev => ({ ...prev, objects: prev.objects.filter(o => o.id !== objectId), isDirty: true }));
  }, []);

  const updateObject = useCallback((objectId: string, updates: Partial<SceneObject>) => {
    setSceneState(prev => ({
      ...prev,
      objects: prev.objects.map(o => (o.id === objectId ? { ...o, ...updates } : o)),
      isDirty: true,
    }));
  }, []);

  const updateCamera = useCallback((updates: Partial<CameraState>) => {
    // Only update if there's an actual change to avoid unnecessary re-renders / dirtying
    setSceneState(prev => {
        const newCamera = { ...prev.camera, ...updates };
        if (JSON.stringify(prev.camera) === JSON.stringify(newCamera)) {
            return prev;
        }
        return { ...prev, camera: newCamera, isDirty: true };
    });
  }, []);

  const setHatchLines = useCallback((lines: HatchPath[]) => {
    setSceneState(prev => ({ ...prev, hatchLines: lines, isDirty: false }));
  }, []);


  return (
    <SceneContext.Provider value={{ 
        ...sceneState, 
        addLight, 
        removeLight, 
        updateLight,
        addObject,
        removeObject,
        updateObject, 
        updateCamera,
        setHatchLines,
        setDirty
    }}>
      {children}
    </SceneContext.Provider>
  );
};

export const useScene = (): SceneContextType => {
  const context = useContext(SceneContext);
  if (context === undefined) {
    throw new Error('useScene must be used within a SceneProvider');
  }
  return context;
};

