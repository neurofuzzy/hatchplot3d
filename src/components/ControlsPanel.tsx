// @ts-nocheck
// TODO: Fix THREE.js types
'use client';

import React from 'react';
import { useScene } from '@/context/SceneContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { exportToSVG } from '@/lib/three-utils';
import { Download, Lightbulb, Trash2, PlusCircle, RotateCcw, Sun } from 'lucide-react';
import type { SceneLight, Vector3 } from '@/types';
import { useToast } from '@/hooks/use-toast';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import * as THREE from 'three';


const ControlsPanel: React.FC = () => {
  const { lights, updateLight, addLight, removeLight, hatchLines, camera, objects, setDirty } = useScene();
  const { toast } = useToast();

  const handleAddLight = () => {
    const newLight: Omit<SceneLight, 'id' | 'castShadow'> = {
      type: 'directional',
      position: { x: Math.random() * 10 - 5, y: 5, z: Math.random() * 10 - 5 },
      target: { x: 0, y: 0, z: 0 },
      color: '#FFFFFF',
      intensity: 0.75,
      hatchAngle: Math.random() * 360,
    };
    addLight(newLight);
    toast({ title: "Light Added", description: "A new directional light has been added to the scene." });
  };

  const handleRemoveLight = (id: string) => {
    removeLight(id);
    toast({ title: "Light Removed", description: "The light has been removed from the scene.", variant: "destructive" });
  };

  const handleLightChange = (id: string, field: keyof SceneLight, value: any) => {
    updateLight(id, { [field]: value });
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


  const handleExportSVG = () => {
    if (!camera) {
        toast({ title: "Export Error", description: "Camera data is not available.", variant: "destructive" });
        return;
    }
    
    const sceneElement = document.querySelector<HTMLDivElement>('.w-full.h-full.absolute.top-0.left-0');
    if (!sceneElement) {
        toast({ title: "Export Error", description: "Scene element not found for dimensions.", variant: "destructive" });
        return;
    }
    const sceneWidth = sceneElement.clientWidth;
    const sceneHeight = sceneElement.clientHeight;
    
    // Create a temporary camera for SVG export based on current camera state
    const tempCamera = new THREE.PerspectiveCamera(camera.fov, sceneWidth / sceneHeight, camera.near, camera.far);
    tempCamera.position.set(camera.position.x, camera.position.y, camera.position.z);
    tempCamera.lookAt(new THREE.Vector3(camera.lookAt.x, camera.lookAt.y, camera.lookAt.z));
    tempCamera.updateProjectionMatrix(); // Ensure projection matrix is up-to-date
    
    const svgData = exportToSVG(hatchLines, tempCamera, sceneWidth, sceneHeight);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hatchplot3d_scene.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "SVG Exported", description: "Your scene has been exported as an SVG file." });
  };

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
            <Accordion type="single" collapsible className="w-full" defaultValue={lights.length > 0 ? `light-0` : undefined}>
              {lights.map((light, index) => (
                <AccordionItem value={`light-${index}`} key={light.id}>
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
                        min={0.05} max={2} step={0.05} // Min intensity 0.05 for at least 1 line
                        value={[light.intensity]}
                        onValueChange={(value) => handleLightChange(light.id, 'intensity', value[0])}
                      />
                       <span className="text-xs text-muted-foreground">{light.intensity.toFixed(2)}</span>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`hatchAngle-${light.id}`}>Hatch Angle</Label>
                       <Slider
                        id={`hatchAngle-${light.id}`}
                        min={0} max={360} step={1}
                        value={[light.hatchAngle]}
                        onValueChange={(value) => handleLightChange(light.id, 'hatchAngle', value[0])}
                      />
                      <span className="text-xs text-muted-foreground">{light.hatchAngle}°</span>
                    </div>
                    
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
