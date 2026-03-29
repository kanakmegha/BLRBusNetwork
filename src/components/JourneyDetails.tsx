import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { PathResult, Stop } from "../engine/types";
import { formatSecondsAsTime } from "../utils/geo";

interface JourneyDetailsProps {
  selectedPath: PathResult;
  stopMap: Map<string, Stop>;
  onBusClick: (busNumber: string) => void;
  onClose: () => void;
}

export function JourneyDetails({ selectedPath, stopMap, onBusClick, onClose }: JourneyDetailsProps) {
  const [expandedSegments, setExpandedSegments] = useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    const next = new Set(expandedSegments);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpandedSegments(next);
  };

  return (
    <div className="absolute top-6 right-6 z-[100] w-96 bg-[#1e1e1e]/95 backdrop-blur-xl p-8 rounded-[32px] border border-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[calc(100vh-48px)] scrollbar-hide">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-gray-400 text-[10px] uppercase tracking-[0.2em] font-black mb-1">
            Total Journey Time
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-white tracking-tighter">
              {Math.round(selectedPath.totalTime / 60)}
            </span>
            <span className="text-xl font-bold text-purple-500 uppercase">
              min
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-500 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-0 relative">
        {/* Timeline track */}
        <div className="absolute left-[11px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-purple-500 via-blue-500 to-emerald-500 opacity-20" />

        {selectedPath.segments.map((seg, idx) => (
          <div
            key={idx}
            className="relative pl-10 pb-10 last:pb-0 group"
          >
            {/* Node point */}
            <div className={`absolute left-0 top-1 w-6 h-6 rounded-full border-4 border-[#1e1e1e] z-10 shadow-lg transition-transform group-hover:scale-125
              ${seg.routeId === "WALKING" ? "bg-gray-600" : "bg-purple-600"}`}
            />

            <div className="flex flex-col gap-2">
              {/* Time and Title Row */}
              <div className="flex justify-between items-center">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded shadow-sm uppercase tracking-wider
                  ${seg.routeId === "WALKING" ? "bg-gray-800 text-gray-400" : "bg-purple-900/50 text-purple-300"}`}>
                  {seg.routeId === "WALKING" 
                    ? "Walking" 
                    : (() => {
                        const nums = (seg as any).busNumbers || [];
                        if (nums.length === 0) return (seg as any).displayName || seg.routeName || "Bus";
                        
                        const primary = nums[0].split(' ')[0];
                        const others = nums.slice(1).map((n: string) => n.split(' ')[0]);
                        
                        const hasLetters = /[A-Z]/i.test(primary);
                        const badgeText = hasLetters ? primary : `Bus ${primary}`;
                        const more = others.length > 0 ? ` +${others.length}` : "";
                        
                        return (
                          <div className="flex items-center gap-1 text-[9px] font-black leading-none">
                            <span 
                              onClick={() => onBusClick(primary)}
                              className="bg-purple-600/80 px-1.5 py-0.5 rounded shadow-sm hover:bg-purple-500 cursor-pointer transition-colors"
                            >
                              {badgeText}{more}
                            </span>
                            {others.length > 0 && (
                              <Popover.Root>
                                <Popover.Trigger asChild>
                                  <button className="bg-purple-500/20 text-purple-300 px-1 py-0.5 rounded-sm hover:bg-purple-500/40 transition-colors cursor-pointer ml-1">
                                    MORE
                                  </button>
                                </Popover.Trigger>
                                <Popover.Portal>
                                  <Popover.Content 
                                    className="popover-content z-[200] bg-[#1e1e1e]/95 backdrop-blur-xl p-4 rounded-2xl border border-white/10 shadow-2xl min-w-[140px]"
                                    sideOffset={5}
                                  >
                                    <div className="flex flex-col gap-2">
                                      <div className="text-[9px] uppercase tracking-widest font-black text-gray-500 mb-1 border-b border-white/5 pb-1">Alternatives</div>
                                      <div className="flex flex-wrap gap-2">
                                        <span 
                                          onClick={() => onBusClick(primary)}
                                          className="bg-purple-600 text-white px-2 py-0.5 rounded text-[10px] font-black cursor-pointer hover:bg-purple-500 transition-colors"
                                        >
                                          {primary}
                                        </span>
                                        {others.map((n: string) => (
                                          <span 
                                            key={n} 
                                            onClick={() => onBusClick(n)}
                                            className="bg-white/5 text-gray-300 px-2 py-0.5 rounded text-[10px] font-black border border-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                                          >
                                            {n}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                    <Popover.Arrow className="fill-[#1e1e1e]/95" />
                                  </Popover.Content>
                                </Popover.Portal>
                              </Popover.Root>
                            )}
                          </div>
                        );
                      })()
                  }
                </span>
                <span className="text-xs font-mono text-gray-500 font-bold bg-white/5 px-2 py-0.5 rounded">
                  {formatSecondsAsTime(seg.departureTime).slice(0, 5)}
                </span>
              </div>

              {/* Stop Names */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <div className="text-sm text-white font-bold leading-tight truncate">
                    {stopMap.get(seg.fromStopId)?.stop_name}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <div className="text-[11px] text-gray-400 font-bold leading-tight truncate">
                    to {stopMap.get(seg.toStopId)?.stop_name}
                  </div>
                </div>

                {seg.routeId !== "WALKING" && seg.routeLongName && (
                  <div className="pl-3.5 text-[9px] text-purple-400/80 font-medium truncate max-w-[240px] uppercase tracking-wider">
                    {seg.routeLongName}
                  </div>
                )}
              </div>

              {/* Metadata Row */}
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                    <span className="text-[10px] text-white font-bold">
                      {Math.round((seg.arrivalTime - seg.departureTime) / 60)} min
                    </span>
                  </div>
                  
                  {seg.routeId !== "WALKING" ? (
                    <button 
                      onClick={() => toggleExpand(idx)}
                      className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/10 hover:bg-white/10 transition-colors group/stop"
                    >
                      <span className="text-[10px] text-gray-400 font-bold group-hover/stop:text-white transition-colors">
                        {seg.stopCount || 0} stops
                      </span>
                      <svg 
                        className={`w-3 h-3 text-gray-500 transition-transform duration-300 ${expandedSegments.has(idx) ? 'rotate-180' : ''}`} 
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                      <span className="text-[10px] text-gray-400 font-bold">
                        {Math.round(seg.distance || 0)}m
                      </span>
                    </div>
                  )}

                  <span className="ml-auto text-xs font-mono text-gray-500 font-bold">
                    Arr {formatSecondsAsTime(seg.arrivalTime).slice(0, 5)}
                  </span>
                </div>

                {/* Expanded Stop List */}
                {expandedSegments.has(idx) && seg.stops && seg.stops.length > 0 && (
                  <div className="mt-2 pl-4 border-l border-white/5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    {seg.stops.slice(1, -1).map((s: any, sIdx: number) => (
                      <div key={sIdx} className="flex items-center gap-2 group/item">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-700 group-hover/item:bg-purple-500 transition-colors" />
                        <span className="text-[11px] text-gray-500 font-medium group-hover/item:text-gray-300 transition-colors uppercase tracking-tight">
                          {s.stop_name}
                        </span>
                      </div>
                    ))}
                    {(seg.stopCount || 0) <= 0 && (
                      <div className="text-[10px] text-gray-600 italic">No intermediate stops</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
