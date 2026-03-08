"use client";

import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import type { ObjektEntry } from "@/lib/cosmo/types";
import type { ObjektStructuralFilters } from "./objekt-owned-picker";

async function searchCollections(query: string): Promise<ObjektEntry[]> {
  const res = await fetch(`/api/objekts/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

interface ObjektPickerProps {
  selected: ObjektEntry[];
  onSelect: (objekt: ObjektEntry) => void;
  onDeselect: (objekt: ObjektEntry) => void;
  maxSelections?: number;
  filters?: ObjektStructuralFilters;
}

export function ObjektPicker({
  selected,
  onSelect,
  onDeselect,
  maxSelections = 10,
  filters,
}: ObjektPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ObjektEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const hits = await searchCollections(query);
      setResults(hits);
      setShowResults(true);
      setLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredResults = useMemo(() => {
    if (!filters) return results;
    let r = results;
    if (filters.artist.length) r = r.filter((o) => filters.artist.some((a) => a.toLowerCase() === o.artist.toLowerCase()));
    if (filters.member.length) r = r.filter((o) => filters.member.includes(o.member));
    if (filters.season.length) r = r.filter((o) => filters.season.includes(o.season));
    if (filters.class.length) r = r.filter((o) => filters.class.includes(o.class));
    if (filters.on_offline.length) {
      r = r.filter((o) => {
        const type = o.collectionNo?.toLowerCase().endsWith("z") ? "offline" : "online";
        return filters.on_offline.includes(type);
      });
    }
    return r;
  }, [results, filters]);

  const isSelected = (entry: ObjektEntry) =>
    selected.some((s) => s.collectionId === entry.collectionId);

  function handleSelect(entry: ObjektEntry) {
    if (isSelected(entry) || selected.length >= maxSelections) return;
    onSelect(entry);
    setQuery("");
    setShowResults(false);
  }

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, entry: ObjektEntry) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setHoverPos({ top: rect.top, left: rect.right + 8 });
      setHoverImage(entry.thumbnailImage ?? null);
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverImage(null);
    setHoverPos(null);
  }, []);

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="relative">
        <Input
          placeholder="Search objekts... e.g. JiWoo, Atom02, 108Z"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
        />

        {showResults && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-lg max-h-60 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Searching...
              </div>
            ) : filteredResults.length > 0 ? (
              filteredResults.map((entry) => (
                <button
                  key={entry.collectionId}
                  type="button"
                  disabled={isSelected(entry)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-accent transition-colors ${
                    isSelected(entry) ? "opacity-40" : ""
                  }`}
                  onClick={() => handleSelect(entry)}
                  onMouseEnter={(e) => handleMouseEnter(e, entry)}
                  onMouseLeave={handleMouseLeave}
                >
                  <span>
                    <span className="text-muted-foreground">{entry.artist}</span>
                    {" "}
                    {entry.member}
                    {" "}
                    <span className="font-mono">{entry.collectionNo}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.season} · {entry.class}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No results found
              </div>
            )}
          </div>
        )}
      </div>

      {hoverImage && hoverPos && (
        <div
          className="fixed z-100 rounded-md overflow-hidden shadow-lg border bg-background pointer-events-none"
          style={{ top: hoverPos.top, left: hoverPos.left }}
        >
          <img src={hoverImage} alt="" className="w-24 h-auto block" />
        </div>
      )}

      {selected.length > 0 && (
        <div className="border rounded-md divide-y">
          {selected.map((objekt) => (
            <div
              key={objekt.collectionId}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span>{objekt.member} {objekt.collectionNo}</span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                onClick={() => onDeselect(objekt)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {selected.length}/{maxSelections} selected
        </p>
      )}
    </div>
  );
}
