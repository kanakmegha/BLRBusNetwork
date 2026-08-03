import { useEffect, useRef, useState } from "react";
import type { Stop } from "../engine/types";
import { MapService } from "../utils/mapService";
import type { AutosuggestSuggestion } from "../utils/mapService";

interface SearchBoxProps {
    stops: Stop[];
    onSearch: (from: string, to: string) => void;
    onPlaceSelect?: (lat: number, lng: number, type: "FROM" | "TO") => void;
    onCriteriaChange?: (option: "FASTEST" | "MIN_FARE" | "MIN_INTERCHANGES") => void;
    selectedCriteria?: "FASTEST" | "MIN_FARE" | "MIN_INTERCHANGES";
    initialFrom?: string;
    initialTo?: string;
    originStopName?: string | null;
    destStopName?: string | null;
}

type LocationState = "DETECTING" | "MANUAL" | "FAILED" | "OUTSIDE";

export function SearchBox(
    {
        stops,
        onSearch,
        onPlaceSelect,
        onCriteriaChange,
        selectedCriteria = "FASTEST",
        initialFrom,
        initialTo,
        originStopName,
        destStopName,
    }: SearchBoxProps,
) {
    const [from, setFrom] = useState(initialFrom || "");
    const [to, setTo] = useState(initialTo || "");
    
    const [locState, setLocState] = useState<LocationState>("DETECTING");
    const [originInput, setOriginInput] = useState("");
    const [originSuggestions, setOriginSuggestions] = useState<AutosuggestSuggestion[]>([]);
    const [isOriginGeocoding, setIsOriginGeocoding] = useState(false);
    
    const [destinationInput, setDestinationInput] = useState("");
    const [destSuggestions, setDestSuggestions] = useState<AutosuggestSuggestion[]>([]);
    const [isDestGeocoding, setIsDestGeocoding] = useState(false);
    
    const [recentSearches, setRecentSearches] = useState<AutosuggestSuggestion[]>([]);
    
    const toInputRef = useRef<HTMLInputElement>(null);
    const fromInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialFrom) setFrom(initialFrom);
    }, [initialFrom]);

    useEffect(() => {
        if (initialTo) setTo(initialTo);
    }, [initialTo]);

    useEffect(() => {
        try {
            const saved = localStorage.getItem("recentSearches");
            if (saved) setRecentSearches(JSON.parse(saved));
        } catch (e) {
            console.error("Failed to load recent searches", e);
        }
    }, []);

    const startGPS = () => {
        setLocState("DETECTING");
        setOriginInput("");
        
        let isCancelled = false;
        const timeoutId = setTimeout(() => {
            if (!isCancelled) {
                setLocState("FAILED");
            }
        }, 10000);
        
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (isCancelled) return;
                clearTimeout(timeoutId);
                const { latitude, longitude } = pos.coords;
                if (latitude < 12.5 || latitude > 13.5 || longitude < 77.0 || longitude > 78.0) {
                    setLocState("OUTSIDE");
                    setTimeout(() => fromInputRef.current?.focus(), 50);
                } else {
                    onPlaceSelect?.(latitude, longitude, "FROM");
                    setOriginInput("Current Location");
                    setLocState("MANUAL");
                }
            },
            (err) => {
                if (isCancelled) return;
                console.warn("Geolocation error", err);
                clearTimeout(timeoutId);
                setLocState("FAILED");
                setTimeout(() => fromInputRef.current?.focus(), 50);
            },
            { timeout: 10000 }
        );
        
        return () => { isCancelled = true; clearTimeout(timeoutId); };
    };

    useEffect(() => {
        const savedOrigin = localStorage.getItem("lastOrigin");
        if (savedOrigin) {
            setOriginInput(savedOrigin);
            setLocState("MANUAL");
        } else {
            const cleanup = startGPS();
            return cleanup;
        }
    }, []);

    const addRecentSearch = (place: AutosuggestSuggestion) => {
        setRecentSearches(prev => {
            const filtered = prev.filter(p => p.placeId !== place.placeId);
            const updated = [place, ...filtered].slice(0, 5);
            localStorage.setItem("recentSearches", JSON.stringify(updated));
            return updated;
        });
    };

    const fetchSuggestions = async (val: string, setSugg: (s: AutosuggestSuggestion[]) => void) => {
        if (!val.trim()) {
            setSugg([]);
            return;
        }

        try {
            const suggestions = await MapService.autosuggest(val, stops);
            setSugg(suggestions);
        } catch (error) {
            console.error("[SearchBox] Error fetching suggestions:", error);
            // Pure local search fallback if all service calls fail
            const normalized = val.toLowerCase().trim();
            const localFallback = stops
                .filter(s => s.stop_name.toLowerCase().includes(normalized))
                .slice(0, 5)
                .map(s => ({
                    placeId: s.stop_id,
                    description: s.stop_name,
                    mainText: s.stop_name,
                    secondaryText: s.busNumbers && s.busNumbers.length > 0 
                        ? `Buses: ${s.busNumbers.slice(0, 3).join(", ")}` 
                        : (s.line_code ? `${s.line_code} Line Metro` : "Bus Stop"),
                    isLocalStop: true,
                    stop: s
                }));
            setSugg(localFallback);
        }
    };

    const handleOriginChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setOriginInput(val);
        if (locState !== "MANUAL") setLocState("MANUAL");
        fetchSuggestions(val, setOriginSuggestions);
    };

    const handleDestinationChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setDestinationInput(val);
        fetchSuggestions(val, setDestSuggestions);
    };

    const handleSuggestionClick = async (suggestion: AutosuggestSuggestion, type: "FROM" | "TO") => {
        const { placeId, description, isLocalStop, stop } = suggestion;

        if (type === "FROM") {
            setOriginInput(description);
            setOriginSuggestions([]);
            localStorage.setItem("lastOrigin", description);
        } else {
            setDestinationInput(description);
            setDestSuggestions([]);
        }

        if (isLocalStop && stop) {
            // Immediate local stop select
            if (type === "FROM") {
                setFrom(stop.stop_id);
            } else {
                setTo(stop.stop_id);
            }
            onPlaceSelect?.(stop.stop_lat, stop.stop_lon, type);
            if (type === "TO") {
                addRecentSearch(suggestion);
            }
            return;
        }

        if (type === "FROM") setIsOriginGeocoding(true);
        else setIsDestGeocoding(true);

        try {
            const coords = await MapService.geocode(placeId, description);
            if (coords && onPlaceSelect) {
                onPlaceSelect(coords.lat, coords.lng, type);
                if (type === "TO") {
                    addRecentSearch(suggestion);
                }
            }
        } catch (e) {
            console.error("[SearchBox] Geocoding failed:", e);
        } finally {
            if (type === "FROM") setIsOriginGeocoding(false);
            else setIsDestGeocoding(false);
        }
    };

    const handleSearch = () => {
        if (!originInput || !destinationInput) {
            alert("Please enter both origin and destination to continue");
            return;
        }
        if (from && to) {
            onSearch(from, to);
        } else {
            alert("Please select a valid location from the suggestions.");
        }
    };

    return (
        <div className="w-full flex flex-col p-3 md:p-6 pb-2">
            <div className="flex justify-between items-center mb-3 h-[44px]">
                <h1 className="text-[16px] md:text-xl font-black text-white tracking-tight font-['Outfit'] whitespace-nowrap">
                    Namma <span className="text-purple-500">Route</span>
                </h1>
                <div className="flex gap-2">
                    {[
                        { id: "FASTEST", icon: "⚡" },
                        { id: "MIN_FARE", icon: "₹" },
                        { id: "MIN_INTERCHANGES", icon: "⇄" },
                    ].map((opt) => (
                        <button
                            key={opt.id}
                            aria-label={opt.id}
                            onClick={() => onCriteriaChange?.(opt.id as any)}
                            className={`flex items-center justify-center w-[36px] h-[36px] rounded-lg text-[14px] font-bold transition-all ${
                                selectedCriteria === opt.id
                                    ? "bg-purple-600 text-white shadow-md"
                                    : "bg-transparent text-gray-400 hover:bg-white/5"
                            }`}
                        >
                            <span>{opt.icon}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-1 mt-1">
                {locState === "OUTSIDE" && (
                    <div className="text-[10px] text-yellow-500 font-bold px-1 animate-pulse">
                        Planning a Bangalore trip? Type your route below! 🗺️
                    </div>
                )}
                {locState === "FAILED" && (
                    <div className="text-[10px] text-red-400 font-bold px-1">
                        Location access denied. Type your start point below
                    </div>
                )}
                <div className="relative z-[210]">
                    <input
                        ref={fromInputRef}
                        type="text"
                        value={locState === "DETECTING" ? "" : originInput}
                        onChange={handleOriginChange}
                        placeholder={locState === "DETECTING" ? "Detecting location..." : "Type origin (e.g. Majestic, Koramangala)"}
                        className={`w-full h-[48px] bg-[#121212] text-white border border-white/5 rounded-2xl pl-10 pr-12 text-[16px] focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-medium ${locState === "DETECTING" ? "placeholder:text-blue-400 animate-pulse" : "placeholder:text-gray-500"}`}
                    />
                    <div className="absolute left-3.5 top-[15px] text-gray-600 group-focus-within:text-purple-500 transition-colors">
                        {locState === "DETECTING" || isOriginGeocoding
                            ? (
                                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            )
                            : (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            )}
                    </div>
                    {locState === "DETECTING" && (
                        <button
                            onClick={() => {
                                setLocState("MANUAL");
                                fromInputRef.current?.focus();
                            }}
                            className="absolute right-3 top-[14px] text-xs text-blue-400 font-bold hover:text-white"
                        >
                            Type instead →
                        </button>
                    )}
                    {locState === "MANUAL" && originInput && (
                        <button
                            onClick={() => {
                                setOriginInput("");
                                setOriginSuggestions([]);
                                localStorage.removeItem("lastOrigin");
                                fromInputRef.current?.focus();
                            }}
                            className="absolute right-3 top-[14px] text-gray-500 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                    {originSuggestions.length > 0 && (
                        <ul className="absolute z-[220] mt-1 w-full bg-[#1e1e1e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-white/5">
                            {originSuggestions.map((s) => (
                                <li
                                    key={s.placeId}
                                    onClick={() => handleSuggestionClick(s, "FROM")}
                                    className="px-4 py-3 hover:bg-white/10 cursor-pointer transition-colors"
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="mt-0.5 text-gray-400">{s.isLocalStop ? "🚌" : "📍"}</span>
                                        <div className="flex flex-col">
                                            <span className="text-sm text-white font-medium truncate">
                                                {s.mainText}
                                            </span>
                                            {s.secondaryText && (
                                                <span className="text-[10px] text-gray-400 truncate">
                                                    {s.secondaryText}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                {locState === "MANUAL" && !originInput && (
                    <button onClick={startGPS} className="text-[10px] text-blue-400 font-bold ml-1 mt-1 flex items-center gap-1">
                        🎯 Use my location
                    </button>
                )}
                {originStopName && (
                    <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[10px] text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                            NEAREST STOP
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium truncate">
                            {originStopName}
                        </span>
                    </div>
                )}
            </div>

            <div className="space-y-1">
                <div className="relative group z-[200]">
                    <input
                        ref={toInputRef}
                        type="text"
                        value={destinationInput}
                        onChange={handleDestinationChange}
                        onFocus={() => {
                            if (!destinationInput && recentSearches.length > 0) {
                                setDestSuggestions(recentSearches);
                            }
                        }}
                        placeholder="Search destination..."
                        className="w-full h-[48px] bg-[#121212] text-white border border-white/5 rounded-2xl pl-10 pr-12 text-[16px] focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-medium placeholder:text-gray-500"
                    />
                    <div className="absolute left-3.5 top-[15px] text-gray-600 group-focus-within:text-purple-500 transition-colors">
                        {isDestGeocoding
                            ? (
                                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                            )
                            : (
                                <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            )}
                    </div>
                    {destinationInput && (
                        <button
                            onClick={() => {
                                setDestinationInput("");
                                setDestSuggestions([]);
                                toInputRef.current?.focus();
                            }}
                            className="absolute right-3 top-[14px] text-gray-500 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                    {destSuggestions.length > 0 && (
                        <ul className="absolute z-[200] mt-1 w-full bg-[#1e1e1e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-white/5">
                            {destSuggestions.map((s) => (
                                <li
                                    key={s.placeId}
                                    onClick={() => handleSuggestionClick(s, "TO")}
                                    className="px-4 py-3 hover:bg-white/10 cursor-pointer transition-colors"
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="mt-0.5 text-gray-400">
                                            {s.isLocalStop ? "🚌" : (!destinationInput.trim() ? "🕒" : "📍")}
                                        </span>
                                        <div className="flex flex-col">
                                            <span className="text-sm text-white font-medium truncate">
                                                {s.mainText}
                                            </span>
                                            {s.secondaryText && (
                                                <span className="text-[10px] text-gray-400 truncate">
                                                    {s.secondaryText}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                {destStopName && (
                    <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[10px] text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                            NEAREST STOP
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium truncate">
                            {destStopName}
                        </span>
                    </div>
                )}
            </div>

            <div className="sticky bottom-0 z-[200] pt-1 pb-1 bg-[#111111]/95 md:bg-transparent">
                <button
                    onClick={handleSearch}
                    className={`w-full h-[48px] font-bold rounded-2xl transition-all shadow-lg active:scale-[0.98] text-[16px] tracking-wide ${originInput && destinationInput ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white' : 'bg-[#2a2a2a] text-gray-500 cursor-not-allowed'}`}
                >
                    Find Optimal Path
                </button>
            </div>

            {!destinationInput && stops.length > 0 && (
                <div className="pt-4 border-t border-white/5 mt-2">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3" style={{ fontVariant: 'small-caps' }}>Popular Destinations</h3>
                    <div 
                        className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide snap-x"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                        {[
                            "Electronic City", 
                            "Kempegowda Majestic", 
                            "Manyata Tech Park", 
                            "Whitefield", 
                            "Silk Board"
                        ].map(dest => (
                            <button
                                key={dest}
                                onClick={() => setDestinationInput(dest)}
                                className="snap-center shrink-0 h-[36px] px-4 bg-[#2a2a2a] text-gray-300 text-[13px] font-medium rounded-full border border-[#444] hover:bg-purple-500/20 hover:text-purple-400 hover:border-purple-500/30 transition-colors whitespace-nowrap"
                            >
                                {dest}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
