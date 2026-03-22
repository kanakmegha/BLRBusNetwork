import { useEffect, useState } from "react";
import { Map as GoogleMap } from "./components/Map";
import { MetroMap } from "./components/MetroMap";
import { SearchBox } from "./components/SearchBox";
import { RouteResults } from "./components/RouteResults";
import { useTransit } from "./hooks/useTransit";
import type { PathResult, TransitFilter } from "./engine/types";
import { formatSecondsAsTime } from "./utils/geo";
import "./App.css";

function App() {
  const { isReady, stops, findRoute, findNearestStop } = useTransit();
  const [results, setResults] = useState<PathResult[]>([]);
  const [selectedPath, setSelectedPath] = useState<PathResult | null>(null);
  const [stopMap, setStopMap] = useState<Map<string, any>>(new Map());
  const [activeFilter, setActiveFilter] = useState<TransitFilter>("Min Time");
  const [showMetroMap, setShowMetroMap] = useState(false);
  const [fromStopId, setFromStopId] = useState("");
  const [toStopId, setToStopId] = useState("");
  const [sortBy, setSortBy] = useState<"TIME" | "FARE" | "TRANSFERS">("TIME");
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: 12.9716,
    lng: 77.5946,
  });
  const [destStopName, setDestStopName] = useState<string | null>(null);

  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (isReady && stops.length > 0) {
      const map = new Map();
      stops.forEach(s => map.set(s.stop_id, s));
      setStopMap(map);

      if (!fromStopId) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          const nearest = findNearestStop(latitude, longitude);
          if (nearest) {
            setFromStopId(nearest.stop_id);
            setMapCenter({ lat: latitude, lng: longitude });
          }
        }, (err) => {
          console.warn("Geolocation failed:", err);
        });
      }
    }
  }, [isReady, findNearestStop, fromStopId, stops]);

  const handleSearch = async (from: string, to: string, filterOverride?: TransitFilter) => {
    if (!from || !to) return;
    setIsSearching(true);
    setHasSearched(true);
    setResults([]);
    const filter = filterOverride || activeFilter;
    const pathResults = await findRoute(from, to, "08:00:00", filter);
    setResults(pathResults);
    if (pathResults.length > 0) {
      setSelectedPath(pathResults[0]);
    } else {
      setSelectedPath(null);
    }
    setIsSearching(false);
  };

  const handleSortChange = (sort: "TIME" | "FARE" | "TRANSFERS") => {
    setSortBy(sort);
    let filter: TransitFilter = "Min Time";
    if (sort === "FARE") filter = "Min Fare";
    if (sort === "TRANSFERS") filter = "Min Interchange";
    setActiveFilter(filter);
    
    if (fromStopId && toStopId) {
      handleSearch(fromStopId, toStopId, filter);
    }
  };

  const handleDestinationPlaceSelect = (lat: number, lng: number) => {
    const nearest = findNearestStop(lat, lng);
    if (nearest) {
      setToStopId(nearest.stop_id);
      setDestStopName(nearest.stop_name);
      if (fromStopId) {
        handleSearch(fromStopId, nearest.stop_id);
      }
    }
  };

  const handleSelectFromMap = (stopId: string, type: "FROM" | "TO") => {
    if (type === "FROM") {
      setFromStopId(stopId);
    } else {
      const stop = stops.find((s) => s.stop_id === stopId);
      setToStopId(stopId);
      setDestStopName(stop?.stop_name || null);
    }

    // Auto-search logic
    const f = type === "FROM" ? stopId : fromStopId;
    const t = type === "TO" ? stopId : toStopId;
    if (f && t) handleSearch(f, t);
  };

  return (
    <main className="relative w-full h-screen bg-[#121212] flex flex-col items-center justify-center overflow-hidden">
      {!isReady
        ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin">
            </div>
            <p className="text-white font-medium animate-pulse">
              Syncing Bengaluru Transit Data...
            </p>
          </div>
        )
        : (
          <>
            {showMetroMap
              ? (
                <div className="absolute inset-0 z-0">
                  <div className="absolute top-24 left-1/2 -translate-x-1/2 z-10 bg-purple-500/20 backdrop-blur-sm px-4 py-2 rounded-full border border-purple-500/30 text-white text-xs animate-pulse">
                    Click stop for Origin | Right-click for Destination
                  </div>
                  <MetroMap
                    stops={stops}
                    onSelectStation={handleSelectFromMap}
                  />
                </div>
              )
              : (
                <GoogleMap
                  stops={stops}
                  center={mapCenter}
                  selectedPath={selectedPath}
                  onStopSelect={(s) => handleSelectFromMap(s.stop_id, "FROM")}
                />
              )}

            <button
              onClick={() => setShowMetroMap(!showMetroMap)}
              className="absolute bottom-10 left-10 z-[100] bg-[#1e1e1e]/90 backdrop-blur-md px-6 py-3 rounded-full border border-purple-500/50 text-white font-bold text-sm shadow-2xl hover:bg-purple-600 transition-all flex items-center gap-2"
            >
              {showMetroMap
                ? "🗺️ Switch to Google Map"
                : "🚇 Switch to Schematic View"}
            </button>

            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-4 w-full px-4 max-w-2xl">
              <SearchBox
                stops={stops}
                onSearch={handleSearch}
                onPlaceSelect={handleDestinationPlaceSelect}
                onSortChange={handleSortChange}
                sortBy={sortBy}
                initialFrom={fromStopId}
                initialTo={toStopId}
                destStopName={destStopName}
              />
            </div>

            <RouteResults
              results={results}
              sortBy={sortBy}
              onSelect={(path) => setSelectedPath(path)}
            />

            {(isSearching || (hasSearched && results.length === 0)) && (
              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[110] bg-[#1e1e1e]/90 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 shadow-2xl flex flex-col items-center gap-2">
                {isSearching
                  ? (
                    <>
                      <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-white text-xs font-bold">
                        Calculating Optimal Route...
                      </span>
                    </>
                  )
                  : (
                    <>
                      <span className="text-2xl">😕</span>
                      <span className="text-white text-xs font-bold">
                        No direct routes found for this time.
                      </span>
                      <span className="text-gray-500 text-[10px]">
                        Try a different starting point or time.
                      </span>
                    </>
                  )}
              </div>
            )}

            {selectedPath && (
              <div className="absolute top-6 right-6 z-[100] w-96 bg-[#1e1e1e]/95 backdrop-blur-xl p-8 rounded-[32px] border border-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden">
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
                    onClick={() => setSelectedPath(null)}
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
                            {seg.routeName || seg.routeId}
                          </span>
                          <span className="text-xs font-mono text-gray-500 font-bold bg-white/5 px-2 py-0.5 rounded">
                            {formatSecondsAsTime(seg.departureTime).slice(0, 5)}
                          </span>
                        </div>

                        {/* Stop Names */}
                        <div className="space-y-0.5">
                          <div className="text-sm text-white font-bold leading-tight">
                            {stopMap.get(seg.fromStopId)?.stop_name}
                          </div>
                          <div className="text-[10px] text-gray-500 font-medium italic">
                            to {stopMap.get(seg.toStopId)?.stop_name}
                          </div>
                        </div>

                        {/* Metadata Row */}
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                            <span className="text-[10px] text-white font-bold">
                              {Math.round((seg.arrivalTime - seg.departureTime) / 60)} min
                            </span>
                          </div>
                          
                          {seg.routeId !== "WALKING" ? (
                            <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                              <span className="text-[10px] text-gray-400 font-bold">
                                {seg.stopCount} stops
                              </span>
                            </div>
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
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
    </main>
  );
}

export default App;
