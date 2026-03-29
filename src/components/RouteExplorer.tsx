import React from "react";
import { Suspense, lazy } from "react";

const LazyBusScheduleTable = lazy(() => import("./BusScheduleTable").then(m => ({ default: m.BusScheduleTable })));

interface RouteExplorerProps {
  explorerRoute: string;
  onShare: () => void;
  onClose: () => void;
}

export function RouteExplorer({ explorerRoute, onShare, onClose }: RouteExplorerProps) {
  return (
    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[110] flex flex-col items-center gap-6 w-full px-6 max-h-[70vh] overflow-y-auto">
      <div className="bg-[#1e1e1e]/90 backdrop-blur-md px-6 py-4 rounded-3xl border border-green-500/30 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] flex items-center gap-6 animate-in fade-in slide-in-from-top-8 duration-500 w-fit">
        <div className="flex flex-col">
          <span className="text-[10px] text-green-500 font-black uppercase tracking-[0.2em] mb-1">Route Explorer</span>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-white font-black text-2xl tracking-tighter">Bus {explorerRoute}</span>
          </div>
        </div>
        <div className="w-px h-10 bg-white/10" />
        
        <div className="flex items-center gap-2">
          <button 
            onClick={onShare}
            className="group relative w-12 h-12 bg-white/5 hover:bg-green-500/20 rounded-2xl flex items-center justify-center transition-all duration-300 active:scale-90"
            title="Share this route"
          >
            <svg className="w-5 h-5 text-white group-hover:text-green-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100-5.368 3 3 0 000 5.368zm0 10.736a3 3 0 100-5.368 3 3 0 000 5.368z" />
            </svg>
          </button>

          <button 
            onClick={onClose}
            className="group relative w-12 h-12 bg-white/5 hover:bg-red-500/20 rounded-2xl flex items-center justify-center transition-all duration-300 active:scale-90"
          >
            <svg className="w-6 h-6 text-white group-hover:text-red-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <Suspense fallback={<div className="text-white text-[10px] uppercase tracking-widest animate-pulse">Loading Schedule...</div>}>
        {explorerRoute === "378" && <LazyBusScheduleTable />}
      </Suspense>
    </div>
  );
}
