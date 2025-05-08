'use client';

import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { SceneProvider } from '@/context/SceneContext';
import ControlsPanel from '@/components/ControlsPanel';
import { HatchPlot3DIcon } from '@/components/icons';
import { SidebarProvider, Sidebar, SidebarInset, SidebarHeader, SidebarTrigger } from '@/components/ui/sidebar';

const SceneViewerWithNoSSR = dynamic(
  () => import('@/components/SceneViewer'),
  { ssr: false }
);

const Home: NextPage = () => {
  return (
    <SceneProvider>
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="icon" className="border-r">
          <SidebarHeader className="p-4 flex items-center gap-2">
             <HatchPlot3DIcon className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold group-data-[collapsible=icon]:hidden">HatchPlot3D</h1>
          </SidebarHeader>
          <ControlsPanel />
        </Sidebar>
        <SidebarInset className="flex flex-col h-screen"> {/* SidebarInset renders a <main> tag */}
           <header className="p-4 border-b flex items-center justify-between md:hidden">
             <div className="flex items-center gap-2">
                <HatchPlot3DIcon className="w-6 h-6 text-primary" />
                <h1 className="text-xl font-semibold">HatchPlot3D</h1>
             </div>
            <SidebarTrigger />
          </header>
          {/* Use a div for layout instead of a nested main tag */}
          <div className="flex-1 relative">
            <SceneViewerWithNoSSR />
          </div>
        </SidebarInset>
      </SidebarProvider>
      {/* Toaster is in layout.tsx */}
    </SceneProvider>
  );
};

export default Home;
