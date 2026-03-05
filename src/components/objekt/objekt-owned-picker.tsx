"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ObjektEntry } from "@/lib/cosmo/types";

type OwnedEntry = ObjektEntry & { count: number };

async function fetchOwned(): Promise<OwnedEntry[]> {
  const res = await fetch("/api/objekts/owned");
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

interface ObjektOwnedPickerProps {
  selected: ObjektEntry[];
  onSelect: (objekt: ObjektEntry) => void;
  onDeselect: (objekt: ObjektEntry) => void;
  maxSelections?: number;
}

export function ObjektOwnedPicker({
  selected,
  onSelect,
  onDeselect,
  maxSelections = 10,
}: ObjektOwnedPickerProps) {
  const [query, setQuery] = useState("");
  const [owned, setOwned] = useState<OwnedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (!query.trim()) return owned;
    const q = query.toLowerCase();
    return owned.filter(
      (o) =>
        o.member.toLowerCase().includes(q) ||
        o.collectionId.toLowerCase().includes(q) ||
        o.collectionNo.toLowerCase().includes(q) ||
        o.season.toLowerCase().includes(q) ||
        o.class.toLowerCase().includes(q) ||
        o.artist.toLowerCase().includes(q),
    );
  }, [owned, query]);

  const isSelected = (entry: ObjektEntry) =>
    selected.some((s) => s.collectionId === entry.collectionId);

  function handleSelect(entry: OwnedEntry) {
    if (isSelected(entry) || selected.length >= maxSelections) return;
    onSelect({
      collectionId: entry.collectionId,
      artist: entry.artist,
      member: entry.member,
      collectionNo: entry.collectionNo,
      season: entry.season,
      class: entry.class,
    });
  }

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
        <div className="border rounded-md max-h-60 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map((entry) => (
              <button
                key={entry.collectionId}
                type="button"
                disabled={isSelected(entry)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-accent transition-colors ${
                  isSelected(entry) ? "opacity-40" : ""
                }`}
                onClick={() => handleSelect(entry)}
              >
                <span>
                  <span className="text-muted-foreground">{entry.artist}</span>{" "}
                  {entry.member}{" "}
                  <span className="font-mono">{entry.collectionNo}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {entry.season} · {entry.class}
                  {entry.count > 1 && ` · x${entry.count}`}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matching objekts
            </div>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <div className="border rounded-md divide-y">
          {selected.map((objekt) => (
            <div
              key={objekt.collectionId}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span>{objekt.collectionId}</span>
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
