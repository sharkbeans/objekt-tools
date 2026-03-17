"use client";

import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import type { ObjektEntry } from "@/lib/cosmo/types";
import type { ObjektStructuralFilters } from "./objekt-owned-picker";
import { shortformMembers } from "@/lib/filters";
import { Trash2 } from "lucide-react";

function hasActiveFilters(filters?: ObjektStructuralFilters): boolean {
  if (!filters) return false;
  return (
    filters.artist.length > 0 ||
    filters.member.length > 0 ||
    filters.season.length > 0 ||
    filters.class.length > 0 ||
    filters.on_offline.length > 0
  );
}

async function fetchByFilters(filters: ObjektStructuralFilters): Promise<ObjektEntry[]> {
  const params = new URLSearchParams();
  for (const a of filters.artist) params.append("artist", a);
  for (const m of filters.member) params.append("member", m);
  for (const s of filters.season) params.append("season", s);
  for (const c of filters.class) params.append("class", c);
  for (const o of filters.on_offline) params.append("on_offline", o);
  const res = await fetch(`/api/objekts/search?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

function resolveShortform(query: string): string {
  const resolved = shortformMembers[query.toLowerCase()];
  return resolved ?? query;
}

async function searchByQuery(query: string): Promise<ObjektEntry[]> {
  const resolved = resolveShortform(query.trim());
  const res = await fetch(`/api/objekts/search?q=${encodeURIComponent(resolved)}`);
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
  const [filterResults, setFilterResults] = useState<ObjektEntry[]>([]);
  const [queryResults, setQueryResults] = useState<ObjektEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const filtersActive = hasActiveFilters(filters);

  // Fetch when filters change
  useEffect(() => {
    if (!filtersActive || !filters) {
      setFilterResults([]);
      return;
    }
    setLoading(true);
    fetchByFilters(filters)
      .then(setFilterResults)
      .finally(() => setLoading(false));
  }, [
    filters?.artist.join(","),
    filters?.member.join(","),
    filters?.season.join(","),
    filters?.class.join(","),
    filters?.on_offline.join(","),
    filtersActive,
  ]);

  const effectiveQuery = query.trim() || (filters?.search?.trim() ?? "");

  // Debounced text search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!effectiveQuery) {
      setQueryResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const hits = await searchByQuery(effectiveQuery);
      setQueryResults(hits);
      setLoading(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [effectiveQuery]);

  // Display: query takes priority over filter results; filter client-side if both active
  const displayResults = useMemo(() => {
    const base = effectiveQuery ? queryResults : filterResults;
    if (!filters || !effectiveQuery) return base;
    // When text searching, also apply structural filters client-side
    let r = base;
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
  }, [query, queryResults, filterResults, filters]);

  const isSelected = (entry: ObjektEntry) =>
    selected.some((s) => s.collectionId === entry.collectionId);

  function handleSelect(entry: ObjektEntry) {
    if (isSelected(entry) || selected.length >= maxSelections) return;
    onSelect(entry);
    setHoverImage(null);
    setHoverPos(null);
  }

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, entry: ObjektEntry) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setHoverPos({ top: rect.top, left: rect.right + 8 });
      setImageLoaded(false);
      setHoverImage(entry.thumbnailImage ?? null);
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverImage(null);
    setHoverPos(null);
  }, []);

  const showList = filtersActive || effectiveQuery.length > 0;

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search objekts... e.g. JiWoo, Atom02, 108Z"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!showList ? (
        <div className="border rounded-md px-3 py-8 text-sm text-muted-foreground text-center">
          Use the filters above to browse objekts
        </div>
      ) : (
        <div className="border rounded-md max-h-60 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
          ) : displayResults.length > 0 ? (
            displayResults.map((entry) => (
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
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found</div>
          )}
        </div>
      )}

      {hoverPos && (
        <div
          className="fixed z-100 rounded-md overflow-hidden shadow-lg border bg-background pointer-events-none"
          style={{ top: hoverPos.top, left: hoverPos.left }}
        >
          {!imageLoaded && (
            <div className="w-24 h-32 flex items-center justify-center text-xs text-muted-foreground">
              Loading...
            </div>
          )}
          {hoverImage && (
            <img
              src={hoverImage}
              alt=""
              className={`w-24 h-auto block ${imageLoaded ? "" : "hidden"}`}
              onLoad={() => setImageLoaded(true)}
            />
          )}
        </div>
      )}

      {selected.length > 0 && (
        <p className="text-md font-medium">Selected Wants</p>
      )}

      {selected.length > 0 && (
        <div className="border rounded-md divide-y">
          {selected.map((objekt) => (
            <div
              key={objekt.collectionId}
              className="flex items-center justify-between px-3 py-2 text-sm"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverPos({ top: rect.top, left: rect.right + 8 });
                setImageLoaded(false);
                setHoverImage(objekt.thumbnailImage ?? null);
              }}
              onMouseLeave={handleMouseLeave}
            >
              <span>
                <span className="text-muted-foreground">{objekt.artist}</span>{" "}
                {objekt.member}{" "}
                <span className="font-mono">{objekt.collectionNo}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {objekt.season} · {objekt.class}
                </span>
                <button
                  type="button"
                  onClick={() => onDeselect(objekt)}
                  className="text-red-500/80 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </span>
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
