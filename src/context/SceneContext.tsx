'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useCallback } from 'react';
import type { SceneState, SceneLight, SceneObject, CameraState, SceneContextType, HatchPath } from '@/types';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

const defaultCameraState: CameraState = {
  position: { x: 5, y: 5, z: 5 },
  lookAt: { x: 0, y: 0, z: 0 },
  fov: 50,
  near: 0.1,
  far: 1000,
};

const initialBox: SceneObject = {
  id: uuidv4(),
  type: 'box',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  color: '#cccccc',
  geometryParams: { width: 1, height: 1, depth: 1 },
};

const initialSphere: SceneObject = {
  id: uuidv4(),
  type: 'sphere',
  position: { x: 2, y: 0.5, z: -1 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  color: '#aaaaaa',
  geometryParams: { radius: 0.5 },
};

const initialLight: SceneLight = {
  id: uuidv4(),
  type: 'directional',
  position: { x: 3, y: 5, z: 4 },
  target: { x: 0, y: 0, z: 0 },
  color: '#ffffff',
  intensity: 0.8, // Maps to hatch density
  hatchAngle: 0, // Default hatch angle
  castShadow: true,
};

const initialState: SceneState = {
  lights: [initialLight],
  objects: [initialBox, initialSphere],
  camera: defaultCameraState,
  hatchLines: [],
  isDirty: true,
};

const SceneContext = createContext<SceneContextType | undefined>(undefined);

export const SceneProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sceneState, setSceneState] = useState<SceneState>(initialState);

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
    setSceneState(prev => ({ ...prev, camera: { ...prev.camera, ...updates }, isDirty: true }));
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
