/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from "react";
import type { Stop } from "../engine/types";

interface SearchBoxProps {
    stops: Stop[];
    onSearch: (from: string, to: string) => void;
    onPlaceSelect?: (lat: number, lng: number) => void;
    onCriteriaChange?: (option: "FASTEST" | "MIN_FARE" | "MIN_INTERCHANGES") => void;
    selectedCriteria?: "FASTEST" | "MIN_FARE" | "MIN_INTERCHANGES";
    initialFrom?: string;
    initialTo?: string;
    destStopName?: string | null;
}

export function SearchBox(
    {
        stops,
        onSearch,
        onPlaceSelect,
        onCriteriaChange,
        selectedCriteria = "FASTEST",
        initialFrom,
        initialTo,
        destStopName,
    }: SearchBoxProps,
) {
    const [from, setFrom] = useState(initialFrom || "");
    const [to, setTo] = useState(initialTo || "");
    const [isGeocoding, setIsGeocoding] = useState(false);
    const toInputRef = useRef<HTMLInputElement>(null);

    const [destinationInput, setDestinationInput] = useState("");
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [recentSearches, setRecentSearches] = useState<any[]>([]);
    

    const sessionToken = useRef<any>(null);

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

    const addRecentSearch = (place: any) => {
        setRecentSearches(prev => {
            const filtered = prev.filter(p => p.place_id !== place.place_id);
            const updated = [place, ...filtered].slice(0, 5); // Keep last 5
            localStorage.setItem("recentSearches", JSON.stringify(updated));
            return updated;
        });
    };

    const handleDestinationChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setDestinationInput(val);

        if (!val.trim()) {
            setSuggestions([]);
            return;
        }

        if ((window as any).google) {
            const { AutocompleteSessionToken, AutocompleteSuggestion } = await (window as any).google.maps.importLibrary("places");
            if (!sessionToken.current) {
                sessionToken.current = new AutocompleteSessionToken();
            }
            try {
                const request = {
                    input: val,
                    sessionToken: sessionToken.current,
                    includedRegionCodes: ["IN"],
                };
                const { suggestions: apiSuggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
                
                // We map this to match our rendering structure.
                // The new API gives .placePrediction.text.text and .placePrediction.placeId
                const formattedSuggestions = apiSuggestions.map((s: any) => ({
                    place_id: s.placePrediction.placeId,
                    description: s.placePrediction.text.text,
                    structured_formatting: {
                        main_text: s.placePrediction.text.text,
                        secondary_text: ""
                    }
                }));
                setSuggestions(formattedSuggestions);
            } catch (error) {
                console.error("Error fetching suggestions:", error);
                setSuggestions([]);
            }
        }
    };

    const handleSuggestionClick = async (placeId: string, description: string) => {
        setDestinationInput(description);
        setSuggestions([]);
        setIsGeocoding(true);

        const { Geocoder } = await (window as any).google.maps.importLibrary("geocoding");
        const geocoder = new Geocoder();
        geocoder.geocode({ placeId }, (results: any, status: any) => {
            setIsGeocoding(false);
            if (status === "OK" && results[0] && onPlaceSelect) {
                const loc = results[0].geometry.location;
                onPlaceSelect(loc.lat(), loc.lng());
                addRecentSearch({ place_id: placeId, description, structured_formatting: { main_text: description, secondary_text: "" } });
            }
        });
        
        if ((window as any).google) {
            const { AutocompleteSessionToken } = await (window as any).google.maps.importLibrary("places");
            sessionToken.current = new AutocompleteSessionToken();
        }
    };

    const handlePopularRoute = (startName: string, destName: string) => {
        // Find approximate matches or just use Geocoder/Places
        // For simplicity, we just pre-fill the destination and trigger search if start is available
        setDestinationInput(destName);
        // If we know the exact stop IDs, we could navigate immediately, but we will let user hit find.
    };

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (
            e.key === "Enter" && destinationInput &&
            (window as any).google
        ) {
            const address = destinationInput;
            setSuggestions([]);
            setIsGeocoding(true);
            const { Geocoder } = await (window as any).google.maps.importLibrary("geocoding");
            const geocoder = new Geocoder();
            geocoder.geocode({
                address,
                componentRestrictions: { country: "IN" },
            }, (results: any, status: any) => {
                setIsGeocoding(false);
                if (status === "OK" && results[0] && onPlaceSelect) {
                    const loc = results[0].geometry.location;
                    onPlaceSelect(loc.lat(), loc.lng());
                }
            });
        }
    };

    const handleSearch = () => {
        if (from && to) onSearch(from, to);
    };

    return (
        <div className="w-full md:w-96 bg-[#1e1e1e]/95 md:bg-[#1e1e1e]/90 backdrop-blur-xl p-6 rounded-t-3xl md:rounded-3xl border-t md:border border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] md:shadow-[0_20px_50px_rgba(0,0,0,0.5)] space-y-5">
            <div className="flex justify-between items-center">
                <h1 className="text-xl font-black text-white tracking-tight font-['Outfit']">
                    Namma <span className="text-purple-500">Route</span>
                </h1>
                <div className="flex gap-2">
                    {[
                        { id: "FASTEST", label: "Fastest", icon: "⚡" },
                        { id: "MIN_FARE", label: "Min Fare", icon: "₹" },
                        {
                            id: "MIN_INTERCHANGES",
                            label: "Min Interchange",
                            icon: "🔄",
                        },
                    ].map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => onCriteriaChange?.(opt.id as any)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${
                                selectedCriteria === opt.id
                                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30 border-purple-400"
                                    : "bg-[#121212] text-gray-400 border border-white/5 hover:border-purple-500/50"
                            }`}
                        >
                            <span>{opt.label}</span>
                            {selectedCriteria === opt.id && (
                                <span className="text-xs">✓</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">
                    Origin
                </label>
                <select
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full bg-[#121212] text-white border border-white/5 rounded-2xl p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-medium appearance-none"
                >
                    <option value="" disabled>Detecting location...</option>
                    {stops.map((s) => (
                        <option key={s.stop_id} value={s.stop_id}>
                            {s.stop_name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">
                    Destination
                </label>
                <div className="relative group">
                    <input
                        ref={toInputRef}
                        type="text"
                        value={destinationInput}
                        onChange={handleDestinationChange}
                        onFocus={() => {
                            if (!destinationInput && recentSearches.length > 0) {
                                setSuggestions(recentSearches);
                            }
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Search landmark or area..."
                        className="w-full bg-[#121212] text-white border border-white/5 rounded-2xl p-3.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-medium placeholder:text-gray-600"
                    />
                    <div className="absolute left-3.5 top-[15px] text-gray-600 group-focus-within:text-purple-500 transition-colors">
                        {isGeocoding
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
                </div>
                {suggestions.length > 0 && (
                    <ul className="absolute z-[200] mt-1 w-full bg-[#1e1e1e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-white/5">
                        {suggestions.map((s) => (
                            <li
                                key={s.place_id}
                                onClick={() => handleSuggestionClick(s.place_id, s.description)}
                                className="px-4 py-3 hover:bg-white/10 cursor-pointer transition-colors"
                            >
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 text-gray-400">
                                        {!destinationInput.trim() ? "🕒" : "📍"}
                                    </span>
                                    <div className="flex flex-col">
                                        <span className="text-sm text-white font-medium truncate">
                                            {s.structured_formatting?.main_text || s.description}
                                        </span>
                                        {s.structured_formatting?.secondary_text && (
                                            <span className="text-[10px] text-gray-500 truncate">
                                                {s.structured_formatting.secondary_text}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                {destStopName && (
                    <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[10px] text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded-full">
                            NEAREST STOP
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium truncate">
                            {destStopName}
                        </span>
                    </div>
                )}
            </div>

            <button
                onClick={handleSearch}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-4 rounded-2xl transition-all shadow-[0_10px_20px_rgba(124,58,237,0.3)] active:scale-[0.98] text-sm tracking-wide"
            >
                Find Optimal Path
            </button>

            {!destinationInput && stops.length > 0 && (
                <div className="pt-2 border-t border-white/5 mt-4">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Popular Destinations</h3>
                    <div className="flex flex-wrap gap-2">
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
                                className="px-3 py-1.5 bg-white/5 hover:bg-purple-500/20 text-gray-300 hover:text-purple-400 text-xs rounded-lg transition-colors border border-white/5 hover:border-purple-500/30"
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
