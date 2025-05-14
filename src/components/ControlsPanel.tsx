// @ts-nocheck
// TODO: Fix THREE.js types
'use client';

import React, { useEffect, useState } from 'react';
import { useScene } from '@/context/SceneContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { exportToSVG } from '@/lib/three-utils';
import { Download, Lightbulb, Trash2, PlusCircle, RotateCcw, Sun, Cube, Target, Box, Sphere } from 'lucide-react';
import type { SceneLight, Vector3, SceneObject } from '@/types';
import { useToast } from '@/hooks/use-toast';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import * as THREE from 'three';
import { cn } from '@/lib/utils';


const ControlsPanel: React.FC = () => {
  const { 
    lights, updateLight, addLight, removeLight, 
    objects, updateObject, addObject, removeObject,
    hatchLines, camera, setDirty 
  } = useScene();
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityType, setSelectedEntityType] = useState<'object' | 'light' | 'lightTarget' | null>(null);
  
  // Track selected entity from SceneViewer
  useEffect(() => {
    const handleSelectionChange = (event: CustomEvent) => {
      const { id, type } = event.detail;
      setSelectedEntityId(id);
      setSelectedEntityType(type);
      
      // Auto-expand the selected entity in the accordion
      if (id) {
        const accordionId = `${type}-${id}`;
        document.getElementById(accordionId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    
    window.addEventListener('entity-selected' as any, handleSelectionChange as EventListener);
    
    return () => {
      window.removeEventListener('entity-selected' as any, handleSelectionChange as EventListener);
    };
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);


  // Light handlers
  const handleAddLight = () => {
    const newLight: Omit<SceneLight, 'id' | 'castShadow'> = {
      type: 'directional',
      position: { x: Math.random() * 6 - 3, y: 4, z: Math.random() * 6 - 3 }, // Keep Y positive for "overhead"
      target: { x: 0, y: 0, z: 0 },
      color: '#FFFFFF',
      intensity: 0.8,
      hatchAngle: Math.floor(Math.random() * 8) * 45, // Snap to 45 deg increments
    };
    addLight(newLight);
    toast({ title: "Light Added", description: "A new directional light has been added to the scene." });
  };

  const handleRemoveLight = (id: string) => {
    removeLight(id);
    toast({ title: "Light Removed", description: "The light has been removed from the scene.", variant: "destructive" });
  };

  const handleLightChange = (id: string, field: keyof SceneLight, value: any) => {
    const currentLight = lights.find(l => l.id === id);
    if (!currentLight) return;

    let updatePayload: Partial<SceneLight> = { [field]: value };

    if (field === 'type') {
      if (value === 'spotlight' && currentLight.spotAngle === undefined) {
        updatePayload.spotAngle = THREE.MathUtils.degToRad(30); // Default spot angle
      }
      // If switching away from spotlight, spotAngle will remain but won't be used.
      // Alternatively, we could clear it: else if (value !== 'spotlight') { updatePayload.spotAngle = undefined; }
    }
    updateLight(id, updatePayload);
  };

  const handleLightPositionChange = (id: string, axis: keyof Vector3, value: number) => {
    const light = lights.find(l => l.id === id);
    if (light) {
      updateLight(id, { position: { ...light.position, [axis]: value } });
    }
  };
  
  const handleLightTargetChange = (id: string, axis: keyof Vector3, value: number) => {
    const light = lights.find(l => l.id === id);
    if (light) {
      updateLight(id, { target: { ...light.target, [axis]: value } });
    }
  };
  
  // Object handlers
  const handleAddObject = (type: 'box' | 'sphere') => {
    const baseObject: Omit<SceneObject, 'id' | 'type' | 'geometryParams'> = {
      position: { x: Math.random() * 4 - 2, y: 0.5, z: Math.random() * 4 - 2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: `#${Math.floor(Math.random()*0xffffff).toString(16).padStart(6, '0')}`,
    };
    
    if (type === 'box') {
      addObject({
        ...baseObject,
        type: 'box',
        geometryParams: { width: 1, height: 1, depth: 1 }
      });
    } else {
      addObject({
        ...baseObject,
        type: 'sphere',
        geometryParams: { radius: 0.5 }
      });
    }
    
    toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} Added`, description: `A new ${type} has been added to the scene.` });
  };
  
  const handleRemoveObject = (id: string) => {
    removeObject(id);
    toast({ title: "Object Removed", description: "The object has been removed from the scene.", variant: "destructive" });
  };
  
  const handleObjectChange = (id: string, field: keyof SceneObject, value: any) => {
    updateObject(id, { [field]: value });
  };
  
  const handleObjectPositionChange = (id: string, axis: keyof Vector3, value: number) => {
    const object = objects.find(o => o.id === id);
    if (object) {
      updateObject(id, { position: { ...object.position, [axis]: value } });
    }
  };
  
  const handleObjectRotationChange = (id: string, axis: keyof Vector3, value: number) => {
    const object = objects.find(o => o.id === id);
    if (object) {
      updateObject(id, { rotation: { ...object.rotation, [axis]: value } });
    }
  };
  
  const handleObjectScaleChange = (id: string, axis: keyof Vector3, value: number) => {
    const object = objects.find(o => o.id === id);
    if (object) {
      updateObject(id, { scale: { ...object.scale, [axis]: value } });
    }
  };
  
  const handleObjectGeometryChange = (id: string, param: string, value: number) => {
    const object = objects.find(o => o.id === id);
    if (object) {
      updateObject(id, { 
        geometryParams: { ...object.geometryParams, [param]: value } 
      });
    }
  };
  
  // Helper to select an entity in the scene
  const selectEntity = (id: string, type: 'object' | 'light' | 'lightTarget') => {
    // Dispatch a custom event to notify SceneViewer to select this entity
    const event = new CustomEvent('select-entity', {
      detail: { id, type }
    });
    window.dispatchEvent(event);
  };


  const handleExportSVG = () => {
    if (!camera) {
        toast({ title: "Export Error", description: "Camera data is not available.", variant: "destructive" });
        return;
    }
    
    // Attempt to get scene dimensions from the SceneViewer's mount point
    // This is a bit of a hack; ideally, dimensions would be passed down or available via context/ref
    const sceneElement = document.querySelector<HTMLDivElement>('div[class*="w-full"][class*="h-full"][class*="absolute"]');
    if (!sceneElement) {
        toast({ title: "Export Error", description: "Scene element not found for dimensions. Using default 800x600.", variant: "destructive" });
        // Fallback dimensions if element not found
        // const svgData = exportToSVG(hatchLines, camera, 800, 600); // Default/fallback size
        // downloadSVG(svgData);
        toast({ title: "SVG Export Disabled", description: "SVG export is temporarily disabled.", variant: "destructive" });
        return;
    }
    const sceneWidth = sceneElement.clientWidth;
    const sceneHeight = sceneElement.clientHeight;
    
    // Create a temporary camera for SVG export based on current camera state
    // This ensures that the SVG export reflects what the user currently sees.
    const tempCamera = new THREE.PerspectiveCamera(camera.fov, sceneWidth / sceneHeight, camera.near, camera.far);
    tempCamera.position.set(camera.position.x, camera.position.y, camera.position.z);
    tempCamera.lookAt(new THREE.Vector3(camera.lookAt.x, camera.lookAt.y, camera.lookAt.z));
    tempCamera.updateProjectionMatrix(); 
    
    // const svgData = exportToSVG(hatchLines, tempCamera, sceneWidth, sceneHeight);
    // downloadSVG(svgData);
    toast({ title: "SVG Export Disabled", description: "SVG export is temporarily disabled.", variant: "destructive" });
  };

  const downloadSVG = (svgData: string) => {
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hatchplot3d_scene.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!isClient) {
    // Render placeholder or null during SSR to avoid hydration errors with dynamic IDs
    return <div className="p-4"><p>Loading controls...</p></div>;
  }


  return (
    <ScrollArea className="h-full w-full p-4 bg-card text-card-foreground">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sun className="text-primary" /> Lights</CardTitle>
            <CardDescription>Manage light sources for hatching.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleAddLight} className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Directional Light
            </Button>
            <Accordion type="single" collapsible className="w-full" defaultValue={lights.length > 0 ? `light-${lights[0].id}` : undefined}>
              {lights.map((light, index) => (
                <AccordionItem value={`light-${light.id}`} key={light.id}>
                  <AccordionTrigger>
                    <div className="flex items-center justify-between w-full">
                       <span className="flex items-center gap-2">
                        <Lightbulb className="text-primary" /> Light {index + 1}
                       </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 p-1">
                    
                    <div className="space-y-2">
                      <Label htmlFor={`intensity-${light.id}`}>Intensity (Density)</Label>
                      <Slider
                        id={`intensity-${light.id}`}
                        min={0.1} max={2} step={0.05} // Min intensity 0.1 for visible lines
                        value={[light.intensity]}
                        onValueChange={(value) => handleLightChange(light.id, 'intensity', value[0])}
                      />
                       <span className="text-xs text-muted-foreground">{light.intensity.toFixed(2)}</span>
                    </div>

                    <div className="grid grid-cols-2 items-center gap-2 mt-2">
                        <Label htmlFor={`light-hatchAngle-${light.id}`}>Hatch Angle</Label>
                        <Input
                          id={`light-hatchAngle-${light.id}`}
                          type="number"
                          value={light.hatchAngle}
                          onChange={(e) => handleLightChange(light.id, 'hatchAngle', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>

                      <div className="grid grid-cols-2 items-center gap-2 mt-2">
                        <Label htmlFor={`light-type-${light.id}`}>Type</Label>
                        <Select
                          value={light.type}
                          onValueChange={(newType: 'directional' | 'spotlight') => handleLightChange(light.id, 'type', newType)}
                        >
                          <SelectTrigger id={`light-type-${light.id}`}>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="directional">Directional</SelectItem>
                            <SelectItem value="spotlight">Spotlight</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {light.type === 'spotlight' && (
                        <div className="grid grid-cols-2 items-center gap-2 mt-2">
                          <Label htmlFor={`light-spotAngle-${light.id}`}>Spot Angle (°)</Label>
                          <Input
                            id={`light-spotAngle-${light.id}`}
                            type="number"
                            value={light.spotAngle || 60}
                            onChange={(e) => {
                              const angleDeg = parseFloat(e.target.value);
                              if (!isNaN(angleDeg)) {
                                handleLightChange(light.id, 'spotAngle', angleDeg);
                              }
                            }}
                            className="w-full"
                            step="1"
                            min="1"
                            max="90" // Max practical spot angle
                          />
                        </div>
                      )}

                    <Separator />
                    <Label className="font-semibold">Position:</Label>
                    {['x', 'y', 'z'].map(axis => (
                      <div key={axis} className="space-y-1">
                        <Label htmlFor={`light-${light.id}-pos-${axis}`} className="capitalize">{axis}</Label>
                        <Input
                          id={`light-${light.id}-pos-${axis}`}
                          type="number"
                          step={0.1}
                          value={light.position[axis as keyof Vector3]}
                          onChange={(e) => handleLightPositionChange(light.id, axis as keyof Vector3, parseFloat(e.target.value))}
                        />
                      </div>
                    ))}
                    <Separator />
                    <Label className="font-semibold">Target:</Label>
                     {['x', 'y', 'z'].map(axis => (
                      <div key={axis} className="space-y-1">
                        <Label htmlFor={`light-${light.id}-tar-${axis}`} className="capitalize">{axis}</Label>
                        <Input
                          id={`light-${light.id}-tar-${axis}`}
                          type="number"
                          step={0.1}
                          value={light.target[axis as keyof Vector3]}
                          onChange={(e) => handleLightTargetChange(light.id, axis as keyof Vector3, parseFloat(e.target.value))}
                        />
                      </div>
                    ))}


                    <Button variant="destructive" size="sm" onClick={() => handleRemoveLight(light.id)} className="w-full mt-2">
                      <Trash2 className="mr-2 h-4 w-4" /> Remove Light
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
        
        {/* Placeholder for Object Controls - To be implemented if STL import is added */}
        {/* <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Cube className="text-primary" /> Objects</CardTitle>
            <CardDescription>Manage objects in the scene.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Object controls (e.g., STL import) will be here.</p>
          </CardContent>
        </Card> */}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Download className="text-primary" /> Export</CardTitle>
            <CardDescription>Download the hatch lines as an SVG file.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportSVG} className="w-full" disabled={hatchLines.length === 0 && objects.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export to SVG
            </Button>
             {hatchLines.length === 0 && objects.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">Add and configure lights to generate hatch lines for export.</p>
            )}
             {objects.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">Scene is empty. Add objects to generate a plot.</p>
            )}
          </CardContent>
        </Card>
        
        <div className="pt-4">
            <Button onClick={() => setDirty(true)} className="w-full" variant="outline">
                <RotateCcw className="mr-2 h-4 w-4" /> Regenerate Hatching
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">Manually trigger a recalculation of hatch lines.</p>
        </div>

      </div>
    </ScrollArea>
  );
};

export default ControlsPanel;
