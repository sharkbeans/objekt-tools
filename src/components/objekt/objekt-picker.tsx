"use client";

import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import type { ObjektEntry } from "@/lib/cosmo/types";
import type { ObjektStructuralFilters } from "./objekt-owned-picker";
import { shortformMembers, membersByArtist } from "@/lib/filters";
import { getArtistForMember } from "@/lib/filter-utils";
import { decodeGroupedValue } from "@/components/ui/class-multi-select";
import { Trash2 } from "lucide-react";
import { ObjektGridPicker } from "./objekt-grid-picker";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

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
  for (const s of filters.season) {
    const d = decodeGroupedValue(s);
    if (d) { params.append("season", d.item); params.append("artist", d.artistId); }
    else params.append("season", s);
  }
  for (const c of filters.class) {
    const d = decodeGroupedValue(c);
    if (d) { params.append("class", d.item); params.append("artist", d.artistId); }
    else params.append("class", c);
  }
  for (const o of filters.on_offline) params.append("on_offline", o);
  const res = await fetch(`/api/objekts/search?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

const allMembers = Object.values(membersByArtist).flat();

function resolveShortform(query: string): string {
  const lower = query.toLowerCase();
  const shortform = shortformMembers[lower];
  if (shortform) return shortform;
  const memberMatch = allMembers.find((m) => m.toLowerCase() === lower);
  if (memberMatch) return memberMatch;
  return query;
}

const seasonPrefixMap: Record<string, string> = {
  A: "Atom01", AA: "Atom02",
  B: "Binary01", BB: "Binary02",
  C: "Cream01",
  D: "Divine01",
  E: "Ever01",
  W: "Winter26",
  SP: "Spring25", SU: "Summer25", AU: "Autumn25",
};

function parseSeasonPrefixQuery(query: string): URLSearchParams | null {
  const terms = query.trim().split(/\s+/);
  const collectionNoRe = /^([A-Za-z]*)(\d{3})[azAZ]?$/i;

  let seasonPrefix: string | null = null;
  let collectionNoDigits: string | null = null;
  let memberTerms: string[] = [];

  for (const term of terms) {
    const m = term.match(collectionNoRe);
    if (m) {
      const prefix = m[1].toUpperCase();
      const digits = m[2];
      if (prefix && seasonPrefixMap[prefix]) {
        seasonPrefix = prefix;
        collectionNoDigits = digits;
      } else {
        collectionNoDigits = term;
      }
    } else {
      memberTerms.push(term);
    }
  }

  if (!collectionNoDigits) return null;

  const params = new URLSearchParams();
  if (seasonPrefix && seasonPrefixMap[seasonPrefix]) {
    params.append("season", seasonPrefixMap[seasonPrefix]);
  }
  params.append("q", collectionNoDigits);

  for (const t of memberTerms) {
    const resolved = resolveShortform(t);
    params.append("member", resolved);
  }

  return params;
}

async function searchByQuery(query: string): Promise<ObjektEntry[]> {
  const trimmed = query.trim();

  const structured = parseSeasonPrefixQuery(trimmed);
  if (structured) {
    const res = await fetch(`/api/objekts/search?${structured.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
  }

  const resolved = resolveShortform(trimmed);
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
  const isMobile = useIsMobile();
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
    let r = base;
    if (filters.artist.length) r = r.filter((o) => filters.artist.some((a) => a.toLowerCase() === o.artist.toLowerCase()));
    if (filters.member.length) r = r.filter((o) => filters.member.includes(o.member));
    if (filters.season.length) r = r.filter((o) => filters.season.some((s) => {
      const d = decodeGroupedValue(s);
      return d ? d.item === o.season && d.artistId === (getArtistForMember(o.member) ?? o.artist) : s === o.season;
    }));
    if (filters.class.length) r = r.filter((o) => filters.class.some((c) => {
      const d = decodeGroupedValue(c);
      return d ? d.item === o.class && d.artistId === (getArtistForMember(o.member) ?? o.artist) : c === o.class;
    }));
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

  if (isMobile) {
    return (
      <div className="space-y-3">
        <Input
          placeholder="Search objekts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {!showList ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Use the filters above to browse objekts
          </div>
        ) : (
          <ObjektGridPicker
            items={displayResults}
            selected={selected}
            onSelect={handleSelect}
            onDeselect={onDeselect}
            loading={loading}
            maxSelections={maxSelections}
            emptyMessage="No results found"
          />
        )}

        {selected.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {selected.length}/{maxSelections} selected
          </p>
        )}
      </div>
    );
  }

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
                className={`picker-item ${isSelected(entry) ? "opacity-40" : ""}`}
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
          className="objekt-hover-preview"
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
        <p className="text-base font-medium">Selected Wants</p>
      )}

      {selected.length > 0 && (
        <div className="border rounded-md divide-y">
          {selected.map((objekt) => (
            <div
              key={objekt.collectionId}
              className="picker-selected-row"
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
