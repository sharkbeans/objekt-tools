"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { objektMatchesSearch } from "@/lib/objekt-search";
import { ObjektGridPicker } from "./objekt-grid-picker";

type OwnedEntry = ObjektEntry & { serial: number; objektId: string };

async function fetchUserObjekts(address: string): Promise<OwnedEntry[]> {
  const res = await fetch(`/api/objekts/user/${encodeURIComponent(address)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

interface ObjektUserPickerProps {
  address: string;
  selected: ObjektEntry[];
  onSelect: (objekt: ObjektEntry) => void;
  onDeselect: (objekt: ObjektEntry) => void;
  maxSelections?: number;
}

export function ObjektUserPicker({
  address,
  selected,
  onSelect,
  onDeselect,
  maxSelections = 10,
}: ObjektUserPickerProps) {
  const [query, setQuery] = useState("");
  const [inventory, setInventory] = useState<OwnedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetchUserObjekts(address)
      .then((results) => {
        setInventory(results);
        setError(null);
      })
      .catch(() => setError("Failed to load their objekts"))
      .finally(() => setLoading(false));
  }, [address]);

  const filtered = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    if (!searchText) return inventory;

    return inventory.filter((o) => objektMatchesSearch(o, searchText));
  }, [inventory, query]);

  function handleSelect(entry: OwnedEntry) {
    const isSelected = selected.some(
      (s) => s.serial != null && s.serial === entry.serial,
    );
    if (isSelected || selected.length >= maxSelections) return;
    onSelect({
      collectionId: entry.collectionId,
      artist: entry.artist,
      member: entry.member,
      collectionNo: entry.collectionNo,
      season: entry.season,
      class: entry.class,
      serial: entry.serial,
      objektId: entry.objektId,
      thumbnailImage: entry.thumbnailImage,
    });
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search their objekts... e.g. JiWoo, Atom02"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading ? (
        <ObjektGridPicker
          items={[]}
          selected={selected}
          onSelect={() => {}}
          onDeselect={onDeselect}
          loading
          compareBySerial
          maxSelections={maxSelections}
        />
      ) : error ? (
        <div className="text-sm text-destructive text-center py-4">{error}</div>
      ) : inventory.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">
          No transferable objekts found for this user.
        </div>
      ) : (
        <ObjektGridPicker
          items={filtered}
          selected={selected}
          onSelect={(o) => handleSelect(o as OwnedEntry)}
          onDeselect={onDeselect}
          compareBySerial
          maxSelections={maxSelections}
          emptyMessage="No matching objekts"
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
