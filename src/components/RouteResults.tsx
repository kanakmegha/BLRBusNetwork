import { useMemo } from "react";
import type { PathResult } from "../engine/types";
import { formatSecondsAsTime } from "../utils/geo";

interface RouteResultsProps {
    results: PathResult[];
    selectedCriteria: "FASTEST" | "MIN_FARE" | "MIN_INTERCHANGES";
    onSelect: (path: PathResult) => void;
    onBusClick: (busNumber: string) => void;
}

export function RouteResults({ results, selectedCriteria, onSelect, onBusClick }: RouteResultsProps) {
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
        <div className="absolute bottom-6 left-6 right-6 z-[100] flex flex-col gap-4">
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {sortedResults.map((result, idx) => (
                    <div
                        key={idx}
                        onClick={() => onSelect(result)}
                        className="min-w-[300px] bg-[#1e1e1e]/90 backdrop-blur-md p-5 rounded-2xl border border-[#333] shadow-2xl cursor-pointer hover:border-purple-500 transition-all hover:-translate-y-1 active:scale-95"
                    >
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-purple-400 font-bold text-sm">
                                PATH {idx + 1}
                            </span>
                            <span className="bg-[#333] text-white text-[10px] px-2 py-1 rounded-full uppercase tracking-tighter">
                                {result.transfers} TRANSFERS
                            </span>
                        </div>

                        <div className="text-2xl font-bold text-white mb-1">
                            {Math.round(result.totalTime / 60)}{" "}
                            <span className="text-sm font-normal text-gray-400">
                                min
                            </span>
                        </div>

                        <div className="flex items-center gap-2 overflow-hidden">
                            {result.segments.map((seg, sidx) => (
                                <div
                                    key={sidx}
                                    className="flex items-center gap-1 shrink-0"
                                >
                                    <div
                                        className={`px-2 py-1 rounded text-[10px] font-bold ${
                                            seg.routeId === "WALKING"
                                                ? "bg-gray-600"
                                                : seg.routeId.startsWith(
                                                        "PURPLE",
                                                    )
                                                ? "bg-purple-600"
                                                : seg.routeId.startsWith(
                                                        "GREEN",
                                                    )
                                                ? "bg-green-600"
                                                : seg.routeId.startsWith(
                                                        "YELLOW",
                                                    )
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
                                        <span className="text-gray-600">→</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 pt-4 border-t border-[#333] flex justify-between text-xs text-gray-500">
                            <span>
                                Arrives {formatSecondsAsTime(
                                    result.segments[result.segments.length - 1]
                                        .arrivalTime,
                                )}
                            </span>
                            <span className="text-white font-bold text-sm">
                                ₹{result.totalFare}
                            </span>
                        </div>

                        <div className="mt-4 space-y-3 max-h-48 overflow-y-auto scrollbar-hide">
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
                                    <div className="flex justify-between items-start">
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                            {seg.routeId === "WALKING" 
                                                ? "Walking" 
                                                : (() => {
                                                    const nums = (seg as any).busNumbers || [];
                                                    if (nums.length === 0) return seg.routeName || "Bus";
                                                    const display = nums.slice(0, 2).map((n: string) => n.replace('Bus ', '').split(' ')[0]).join(", ");
                                                    const more = nums.length > 2 ? ` +${nums.length - 2} more` : "";
                                                    return `Bus ${display}${more}`;
                                                })()
                                            }
                                            {seg.stopCount
                                                ? ` • ${seg.stopCount} stops`
                                                : ""}
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-white font-medium">
                                        {seg.stops?.[0]?.stop_name}
                                    </div>
                                    {seg.stops && seg.stops.length > 2 && (
                                        <div className="text-[9px] text-gray-500 my-1 space-y-0.5">
                                            {seg.stops.slice(1, -1).map((
                                                s,
                                                i,
                                            ) => (
                                                <div key={i}>
                                                    • {s.stop_name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="text-[11px] text-white font-medium">
                                        {seg.stops?.slice(-1)[0]?.stop_name ||
                                            "..."}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
