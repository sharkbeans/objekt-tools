"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { makeTradeItemTags, searchFilter } from "@/lib/filter-utils";

type OwnedEntry = ObjektEntry & { serial: number };

const thumbnailCache = new Map<string, string | null>();

function fetchThumbnail(collectionId: string): Promise<string | null> {
  const cached = thumbnailCache.get(collectionId);
  if (cached !== undefined) return Promise.resolve(cached);

  return fetch(`/api/objekts/search?q=${encodeURIComponent(collectionId)}`)
    .then((res) => res.json())
    .then((data) => {
      const match = data.results?.find(
        (r: any) => r.collectionId === collectionId,
      );
      const url = match?.thumbnailImage ?? match?.frontImage ?? null;
      thumbnailCache.set(collectionId, url);
      return url;
    })
    .catch(() => {
      thumbnailCache.set(collectionId, null);
      return null;
    });
}

async function fetchOwned(): Promise<OwnedEntry[]> {
  const res = await fetch("/api/objekts/owned");
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

export type ObjektStructuralFilters = {
  artist: string[];
  member: string[];
  season: string[];
  class: string[];
  on_offline: string[];
  search?: string;
};

interface ObjektOwnedPickerProps {
  selected: ObjektEntry[];
  onSelect: (objekt: ObjektEntry) => void;
  onDeselect: (objekt: ObjektEntry) => void;
  maxSelections?: number;
  filters?: ObjektStructuralFilters;
}

export function ObjektOwnedPicker({
  selected,
  onSelect,
  onDeselect,
  maxSelections = 10,
  filters,
}: ObjektOwnedPickerProps) {
  const [query, setQuery] = useState("");
  const [owned, setOwned] = useState<OwnedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchOwned()
      .then((results) => {
        setOwned(results);
        setError(null);
      })
      .catch(() => setError("Failed to load your objekts"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = owned;

    const searchText = [query.trim(), filters?.search?.trim()]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (searchText) {
      // Parse with the same OR (comma) / AND (space) / NOT (!) grammar as the trades page
      const queries = searchText
        .split(",")
        .map((group) =>
          group.trim().split(" ").map((t) => t.trim()).filter(Boolean),
        )
        .filter((group) => group.length > 0);

      result = result.filter((o) => {
        const tags = makeTradeItemTags(o);
        return queries.some((group) =>
          group.every((term) =>
            term.startsWith("!")
              ? !searchFilter(term.slice(1), o, tags)
              : searchFilter(term, o, tags),
          ),
        );
      });
    }

    if (filters) {
      if (filters.artist.length) result = result.filter((o) => filters.artist.some((a) => a.toLowerCase() === o.artist.toLowerCase()));
      if (filters.member.length) result = result.filter((o) => filters.member.includes(o.member));
      if (filters.season.length) result = result.filter((o) => filters.season.includes(o.season));
      if (filters.class.length) result = result.filter((o) => filters.class.includes(o.class));
      if (filters.on_offline.length) {
        result = result.filter((o) => {
          const type = o.collectionNo.toLowerCase().endsWith("z") ? "offline" : "online";
          return filters.on_offline.includes(type);
        });
      }
    }

    return result;
  }, [owned, query, filters]);

  const isSelected = (entry: OwnedEntry) =>
    selected.some((s) => s.serial != null && s.serial === entry.serial);

  function handleSelect(entry: OwnedEntry) {
    if (isSelected(entry) || selected.length >= maxSelections) return;
    onSelect({
      collectionId: entry.collectionId,
      artist: entry.artist,
      member: entry.member,
      collectionNo: entry.collectionNo,
      season: entry.season,
      class: entry.class,
      serial: entry.serial,
    });
  }

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, collectionId: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setHoverPos({ top: rect.top, left: rect.right + 8 });
      setHoverImage(thumbnailCache.get(collectionId) ?? null);

      fetchThumbnail(collectionId).then((url) => {
        setHoverImage(url);
      });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverImage(null);
    setHoverPos(null);
  }, []);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Filter your objekts... e.g. JiWoo, Atom02, 108Z"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-4">
          Loading your objekts...
        </div>
      ) : error ? (
        <div className="text-sm text-destructive text-center py-4">{error}</div>
      ) : owned.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">
          No objekts found. Make sure your Cosmo account is linked.
        </div>
      ) : (
        <div ref={containerRef} className="border rounded-md max-h-60 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.slice(0, 24).map((entry) => (
              <button
                key={entry.serial}
                type="button"
                disabled={isSelected(entry)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-accent transition-colors ${
                  isSelected(entry) ? "opacity-40" : ""
                }`}
                onClick={() => handleSelect(entry)}
                onMouseEnter={(e) => handleMouseEnter(e, entry.collectionId)}
                onMouseLeave={handleMouseLeave}
              >
                <span>
                  <span className="text-muted-foreground">{entry.artist}</span>{" "}
                  {entry.member}{" "}
                  <span className="font-mono">{entry.collectionNo}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {entry.season} · {entry.class} · #{String(entry.serial).padStart(5, "0")}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matching objekts
            </div>
          )}
          {filtered.length > 24 && (
            <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t">
              Showing 24 of {filtered.length} — use filters or search to narrow down
            </div>
          )}
        </div>
      )}

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
              key={objekt.serial ?? objekt.collectionId}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span>
                {objekt.member} {objekt.collectionNo}
                {objekt.serial != null && (
                  <span className="text-xs text-muted-foreground ml-1">#{String(objekt.serial).padStart(5, "0")}</span>
                )}
              </span>
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
