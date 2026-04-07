"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { makeTradeItemTags, searchFilter, getArtistForMember } from "@/lib/filter-utils";
import { decodeGroupedValue } from "@/components/ui/class-multi-select";
import { ObjektGridPicker } from "./objekt-grid-picker";

type OwnedEntry = ObjektEntry & { serial: number; objektId: string };

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
      if (filters.season.length) result = result.filter((o) => filters.season.some((s) => {
        const d = decodeGroupedValue(s);
        return d ? d.item === o.season && d.artistId === (getArtistForMember(o.member) ?? o.artist) : s === o.season;
      }));
      if (filters.class.length) result = result.filter((o) => filters.class.some((c) => {
        const d = decodeGroupedValue(c);
        return d ? d.item === o.class && d.artistId === (getArtistForMember(o.member) ?? o.artist) : c === o.class;
      }));
      if (filters.on_offline.length) {
        result = result.filter((o) => {
          const type = o.collectionNo.toLowerCase().endsWith("z") ? "offline" : "online";
          return filters.on_offline.includes(type);
        });
      }
    }

    return result;
  }, [owned, query, filters]);

  function handleSelect(entry: OwnedEntry) {
    const isSelected = selected.some((s) => s.serial != null && s.serial === entry.serial);
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
        placeholder="Filter your objekts... e.g. JiWoo, Atom02, 108Z"
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
      ) : owned.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4 space-y-2">
          <p>No objekts found. Make sure your Cosmo account is linked.</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/link">Link Cosmo Account</Link>
          </Button>
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
