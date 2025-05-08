export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Euler {
  x: number;
  y: number;
  z: number;
}

export type LightType = 'directional'; // Expandable to 'spotlight', 'pointlight'

export interface SceneLight {
  id: string;
  type: LightType;
  position: Vector3;
  target: Vector3; // For directional and spotlights
  color: string; // Hex color string, e.g., "#ffffff"
  intensity: number; // Typically 0-1, could be higher. For hatching, maps to density.
  hatchAngle: number; // In degrees, 0-360
  castShadow: boolean; // Whether this light's hatching considers shadows
}

export type ObjectType = 'box' | 'sphere'; // Expandable (e.g., 'stl')

export interface SceneObject {
  id: string;
  type: ObjectType;
  position: Vector3;
  rotation: Euler;
  scale: Vector3;
  color: string; // Hex color string
  geometryParams: {
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
    widthSegments?: number;
    heightSegments?: number;
  };
}

export interface CameraState {
  position: Vector3;
  lookAt: Vector3;
  fov: number;
  near: number;
  far: number;
}

export interface HatchLineSegment {
  start: Vector3;
  end: Vector3;
}

export type HatchPath = HatchLineSegment[];

export interface SceneState {
  lights: SceneLight[];
  objects: SceneObject[];
  camera: CameraState;
  hatchLines: HatchPath[]; // Array of paths, where each path is an array of line segments
  isDirty: boolean; // Flag to trigger re-render or re-calculation
}

// Context-specific types
export interface SceneContextType extends SceneState {
  addLight: (light: Omit<SceneLight, 'id' | 'castShadow'>) => void;
  removeLight: (lightId: string) => void;
  updateLight: (lightId: string, updates: Partial<SceneLight>) => void;
  addObject: (object: Omit<SceneObject, 'id'>) => void;
  removeObject: (objectId: string) => void;
  updateObject: (objectId: string, updates: Partial<SceneObject>) => void;
  updateCamera: (updates: Partial<CameraState>) => void;
  setHatchLines: (lines: HatchPath[]) => void;
  setDirty: (dirty: boolean) => void;
}
