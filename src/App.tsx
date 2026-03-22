import { useEffect, useState } from "react";
import { Map as GoogleMap } from "./components/Map";
import { MetroMap } from "./components/MetroMap";
import { SearchBox } from "./components/SearchBox";
import { RouteResults } from "./components/RouteResults";
import { useTransit } from "./hooks/useTransit";
import type { PathResult } from "./engine/types";
import "./App.css";

function App() {
  const { isReady, stops, findRoute, findNearestStop } = useTransit();
  const [results, setResults] = useState<PathResult[]>([]);
  const [selectedPath, setSelectedPath] = useState<PathResult | null>(null);
  const [stopMap, setStopMap] = useState<Map<string, any>>(new Map());
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

  const handleSearch = async (from: string, to: string) => {
    if (!from || !to) return;
    setIsSearching(true);
    setHasSearched(true);
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${
      now.getMinutes().toString().padStart(2, "0")
    }:00`;

    const paths = await findRoute(from, to, timeStr);
    console.log(`App: Found ${paths.length} paths`);
    setResults(paths);
    if (paths.length > 0) {
      setSelectedPath(paths[0]);
    } else {
      setSelectedPath(null);
      console.warn(
        "App: No routes found for the given origin/destination/time",
      );
    }
    setIsSearching(false);
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

            <SearchBox
              stops={stops}
              onSearch={handleSearch}
              onPlaceSelect={handleDestinationPlaceSelect}
              onSortChange={(s) => setSortBy(s)}
              sortBy={sortBy}
              initialFrom={fromStopId}
              initialTo={toStopId}
              destStopName={destStopName}
            />

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
              <div className="absolute top-6 right-6 z-[100] w-80 bg-[#1e1e1e]/95 backdrop-blur-md p-6 rounded-2xl border border-purple-500/30 shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold text-white">
                    Journey Details
                  </h2>
                  <button
                    onClick={() => setSelectedPath(null)}
                    className="text-gray-500 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-hide">
                  {selectedPath.segments.map((seg, idx) => (
                    <div
                      key={idx}
                      className="relative pl-6 border-l-2 border-[#333]"
                    >
                      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-purple-500 border-2 border-[#1e1e1e]">
                      </div>
                      <div className="text-xs font-bold text-purple-400 mb-1">
                        {seg.routeId}
                      </div>
                      <div className="text-sm text-white font-medium">
                        {stopMap.get(seg.fromStopId)?.stop_name}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        to {stopMap.get(seg.toStopId)?.stop_name}
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
