"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { decodeGroupedValue } from "@/components/ui/class-multi-select";
import { Input } from "@/components/ui/input";
import type { ObjektEntry } from "@/lib/cosmo/types";
import {
  type ObjektStructuralFilters,
  objektMatchesStructuralFilters,
} from "@/lib/filter-utils";
import { resolveObjektSearchTerm } from "@/lib/objekt-search";
import { seasonPrefixMap } from "@/lib/season-prefix";
import { ObjektGridPicker } from "./objekt-grid-picker";

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

async function fetchByFilters(
  filters: ObjektStructuralFilters,
): Promise<ObjektEntry[]> {
  const params = new URLSearchParams();
  for (const a of filters.artist) params.append("artist", a);
  for (const m of filters.member) params.append("member", m);
  for (const s of filters.season) {
    const d = decodeGroupedValue(s);
    if (d) {
      params.append("season", d.item);
      params.append("artist", d.artistId);
    } else params.append("season", s);
  }
  for (const c of filters.class) {
    const d = decodeGroupedValue(c);
    if (d) {
      params.append("class", d.item);
      params.append("artist", d.artistId);
    } else params.append("class", c);
  }
  for (const o of filters.on_offline) params.append("on_offline", o);
  const res = await fetch(`/api/objekts/search?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

function parseSeasonPrefixQuery(query: string): URLSearchParams | null {
  const terms = query.trim().split(/\s+/);
  const collectionNoRe = /^([A-Za-z]*)(\d{3})[azAZ]?$/i;

  let seasonPrefix: string | null = null;
  let collectionNoDigits: string | null = null;
  const memberTerms: string[] = [];

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
    const resolved = resolveObjektSearchTerm(t);
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

  const resolved = resolveObjektSearchTerm(trimmed);
  const res = await fetch(
    `/api/objekts/search?q=${encodeURIComponent(resolved)}`,
  );
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
  gridClassName?: string;
  /** Shows selected items in a pinned row above the results grid. */
  showSelectedRow?: boolean;
  /** Label for the pinned selected row. */
  selectedRowLabel?: string;
}

export function ObjektPicker({
  selected,
  onSelect,
  onDeselect,
  maxSelections = 10,
  filters,
  gridClassName,
  showSelectedRow = false,
  selectedRowLabel = "Selected",
}: ObjektPickerProps) {
  const [query, setQuery] = useState("");
  const [filterResults, setFilterResults] = useState<ObjektEntry[]>([]);
  const [queryResults, setQueryResults] = useState<ObjektEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const filtersActive = hasActiveFilters(filters);

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

  const displayResults = useMemo(() => {
    const base = effectiveQuery ? queryResults : filterResults;
    if (!filters || !effectiveQuery) return base;
    return base.filter((o) => objektMatchesStructuralFilters(o, filters));
  }, [effectiveQuery, queryResults, filterResults, filters]);

  function handleSelect(entry: ObjektEntry) {
    const isSelected = selected.some(
      (s) => s.collectionId === entry.collectionId,
    );
    if (isSelected || selected.length >= maxSelections) return;
    onSelect(entry);
  }

  const showList = filtersActive || effectiveQuery.length > 0;

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search objekts... e.g. JiWoo, Atom02, 108Z"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!showList ? (
        <ObjektGridPicker
          items={[]}
          selected={selected}
          onSelect={() => {}}
          onDeselect={onDeselect}
          maxSelections={maxSelections}
          emptyMessage="Use the filters above to browse objekts"
          gridClassName={gridClassName}
          showSelectedRow={showSelectedRow}
          selectedRowLabel={selectedRowLabel}
        />
      ) : (
        <ObjektGridPicker
          items={displayResults}
          selected={selected}
          onSelect={handleSelect}
          onDeselect={onDeselect}
          loading={loading}
          maxSelections={maxSelections}
          emptyMessage="No results found"
          gridClassName={gridClassName}
          showSelectedRow={showSelectedRow}
          selectedRowLabel={selectedRowLabel}
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
