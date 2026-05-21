import { useMemo, useState } from "react";
import type { PathResult } from "../engine/types";
import { formatSecondsAsTime } from "../utils/geo";

interface RouteResultsProps {
    results: PathResult[];
    selectedCriteria: "FASTEST" | "MIN_FARE" | "MIN_INTERCHANGES";
    selectedPath?: PathResult | null;
    onSelect: (path: PathResult) => void;
    onBusClick: (busNumber: string) => void;
}

export function RouteResults({ results, selectedCriteria, selectedPath, onSelect, onBusClick }: RouteResultsProps) {
    const [expandedPathIdx, setExpandedPathIdx] = useState<number | null>(null);

    const sortedResults = useMemo(() => {
        return [...results].sort((a, b) => {
            if (selectedCriteria === "FASTEST") return a.totalTime - b.totalTime;
            if (selectedCriteria === "MIN_FARE") return a.totalFare - b.totalFare;
            if (selectedCriteria === "MIN_INTERCHANGES") return a.transfers - b.transfers;
            return 0;
        });
    }, [results, selectedCriteria]);

    if (results.length === 0) return null;

    return (
        <div className="flex flex-col gap-4 p-4 md:p-0">
            <div className="flex flex-col md:flex-row gap-4 overflow-y-auto md:overflow-x-auto pb-4 scrollbar-hide -webkit-overflow-scrolling-touch">
                {sortedResults.map((result, idx) => {
                    const isExpanded = expandedPathIdx === idx;
                    const isSelected = selectedPath === result;
                    return (
                    <div
                        key={idx}
                        onClick={() => {
                            onSelect(result);
                            setExpandedPathIdx(isExpanded ? null : idx);
                        }}
                        className={`w-full md:min-w-[300px] p-4 rounded-2xl border-l-4 shadow-lg cursor-pointer transition-all active:scale-[0.98] ${
                            isSelected 
                                ? 'bg-white/10 border-l-purple-500 border-y-white/10 border-r-white/10' 
                                : 'bg-white/5 border-transparent hover:bg-white/10'
                        }`}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-purple-400 font-bold text-sm">
                                PATH {idx + 1}
                            </span>
                            <span className="bg-[#333] text-white text-[10px] px-2 py-1 rounded-full uppercase tracking-tighter">
                                {result.transfers} TRANSFERS
                            </span>
                        </div>

                        <div className="flex items-center gap-3 text-sm text-gray-300 font-medium mb-2">
                            <span className="flex items-center gap-1 text-white flex-nowrap">
                                ⚡ <span className="text-[32px] font-bold leading-none">{Math.round(result.totalTime / 60)}</span>
                                <span className="text-[16px] font-normal text-gray-400 self-end mb-[2px]">min</span>
                            </span>
                            <span>•</span>
                            <span>💰 ₹{result.totalFare}</span>
                            <span>•</span>
                            <span>🔄 {result.transfers} transfers</span>
                        </div>
                        
                        <div className="text-xs text-gray-400 font-medium mb-4">
                            Arrives {formatSecondsAsTime(
                                result.segments[result.segments.length - 1].arrivalTime
                            )}
                        </div>

                        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap min-w-fit pb-2 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                            {result.segments.map((seg, sidx) => (
                                <div
                                    key={sidx}
                                    className="flex items-center gap-1 shrink-0"
                                >
                                    <div
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                                            seg.routeId === "WALKING"
                                                ? "bg-gray-600"
                                                : seg.routeId.startsWith("PURPLE")
                                                ? "bg-purple-600"
                                                : seg.routeId.startsWith("GREEN")
                                                ? "bg-green-600"
                                                : seg.routeId.startsWith("YELLOW")
                                                ? "bg-yellow-600"
                                                : "bg-blue-600"
                                        }`}
                                    >
                                        {seg.routeId === "WALKING"
                                            ? "W"
                                            : (() => {
                                                const raw = (seg as any).displayName || (seg as any).routeName || "Bus";
                                                const busNum = raw.replace('Bus ', '').split(' ')[0];
                                                return (
                                                    <span 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onBusClick(busNum);
                                                        }}
                                                        className="hover:underline cursor-pointer"
                                                    >
                                                        {busNum}
                                                    </span>
                                                );
                                            })()}
                                    </div>
                                    {sidx < result.segments.length - 1 && (
                                        <span className="text-gray-600 font-bold px-1">→</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 text-center text-xs text-purple-400 font-bold">
                            {isExpanded ? "▲ Hide details" : "▼ See step by step"}
                        </div>

                        {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-[#333] space-y-4 overflow-y-auto scrollbar-hide">
                                {result.segments.map((seg, sidx) => (
                                    <div
                                        key={sidx}
                                        className="relative pl-4 border-l border-[#333]"
                                    >
                                        <div
                                            className={`absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#1e1e1e] ${
                                                seg.routeId === "WALKING"
                                                    ? "bg-gray-500"
                                                    : "bg-purple-500"
                                            }`}
                                        />
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                                                {seg.routeId === "WALKING" 
                                                    ? `WALKING • ${Math.round(seg.distance || 0)}m • ${Math.round((seg.arrivalTime - seg.departureTime)/60)} min`
                                                    : (() => {
                                                        const nums = (seg as any).busNumbers || [];
                                                        if (nums.length === 0) return seg.routeName || "Bus";
                                                        const display = nums.slice(0, 2).map((n: string) => n.replace('Bus ', '').split(' ')[0]).join(", ");
                                                        return `BUS ${display} • ${seg.stopCount || 0} STOPS`;
                                                    })()
                                                }
                                            </div>
                                        </div>
                                        
                                        {seg.routeId !== "WALKING" && (seg as any).busNumbers?.length > 2 && (
                                            <div className="text-[9px] text-gray-500 mb-1">
                                                +{(seg as any).busNumbers.length - 2} more options
                                            </div>
                                        )}

                                        <div className="text-[12px] text-white font-medium">
                                            {seg.stops?.[0]?.stop_name}
                                        </div>
                                        {seg.stops && seg.stops.length > 2 && (
                                            <div className="text-[10px] text-gray-500 my-1 space-y-0.5 border-l-2 border-white/10 ml-1 pl-2">
                                                {seg.stops.slice(1, -1).map((s, i) => (
                                                    <div key={i}>{s.stop_name}</div>
                                                ))}
                                            </div>
                                        )}
                                        {seg.stops && seg.stops.length > 1 && (
                                            <div className="text-[12px] text-white font-medium mt-1">
                                                {seg.stops?.slice(-1)[0]?.stop_name || "..."}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )})}
            </div>
        </div>
    );
}
