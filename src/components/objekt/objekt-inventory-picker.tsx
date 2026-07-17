"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ObjektEntry } from "@/lib/cosmo/types";
import type { OwnedEntry } from "@/lib/cosmo-inventory";
import {
  type ObjektStructuralFilters,
  objektMatchesStructuralFilters,
} from "@/lib/filter-utils";
import { objektMatchesSearch } from "@/lib/objekt-search";
import { parseObjektSearchShortcuts } from "@/lib/trade-search-shortcuts";
import {
  defaultFilters,
  ObjektFilterBar,
  type ObjektFilterState,
} from "./objekt-filter-bar";
import { ObjektGridPicker } from "./objekt-grid-picker";

export function OwnedInventoryEmptyState() {
  return (
    <div className="text-sm text-muted-foreground text-center py-4 space-y-2">
      <p>No objekts found. Make sure your Cosmo account is linked.</p>
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="bg-white! text-black! hover:bg-white/90! hover:text-black!"
      >
        <Link href="/link">Link Cosmo Account</Link>
      </Button>
    </div>
  );
}

interface ObjektInventoryPickerProps {
  fetchItems: () => Promise<OwnedEntry[]>;
  selected: ObjektEntry[];
  onSelect: (objekt: ObjektEntry) => void;
  onDeselect: (objekt: ObjektEntry) => void;
  maxSelections?: number;
  /** External structural filters (e.g. a page-level filter bar). */
  filters?: ObjektStructuralFilters;
  /** Reports live member/season shortcuts for display in an external filter bar. */
  onShortcutFiltersChange?: (filters: {
    member: string[];
    season: string[];
  }) => void;
  emptyState?: ReactNode;
  gridClassName?: string;
  searchPlaceholder?: string;
  /** Renders an internal structural-only filter bar (artist/member/season/class/type). */
  showFilterBar?: boolean;
  /** Extra controls (e.g. Cancel/Confirm) rendered at the end of the internal filter bar's dropdown row. */
  filterBarActions?: ReactNode;
  /** When set, the grid uses this many columns instead of the fixed 3/5 layout. */
  perRow?: number;
  /** When set together with `perRow`, renders a per-row dropdown in the picker header. */
  onPerRowChange?: (n: number) => void;
  /** Entries matching this predicate are sorted before non-matching entries. */
  prioritize?: (entry: OwnedEntry) => boolean;
  /** Called once with the total item count after a successful fetch. */
  onLoaded?: (count: number) => void;
  /** Items shown per page. Defaults to 40. */
  pageSize?: number;
  /** Shows selected items in a pinned row above the inventory grid. */
  showSelectedRow?: boolean;
  /** Label for the pinned selected row. */
  selectedRowLabel?: string;
  /** Optional label shown above the remaining inventory grid. */
  mainGridLabel?: string;
  /** When true, merges duplicate selected entries into one card with a quantity badge. */
  combineSelectedDuplicates?: boolean;
}

export function ObjektInventoryPicker({
  fetchItems,
  selected,
  onSelect,
  onDeselect,
  maxSelections = 10,
  filters,
  onShortcutFiltersChange,
  emptyState,
  gridClassName,
  searchPlaceholder = "Filter your objekts... e.g. sy cc101",
  showFilterBar = false,
  filterBarActions,
  perRow,
  onPerRowChange,
  pageSize,
  prioritize,
  onLoaded,
  showSelectedRow,
  selectedRowLabel,
  mainGridLabel,
  combineSelectedDuplicates,
}: ObjektInventoryPickerProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<OwnedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [internalFilters, setInternalFilters] =
    useState<ObjektFilterState>(defaultFilters);
  const smartSearch = useMemo(() => parseObjektSearchShortcuts(query), [query]);

  function updateQuery(search: string) {
    setQuery(search);
    if (onShortcutFiltersChange) {
      const parsed = parseObjektSearchShortcuts(search);
      onShortcutFiltersChange({
        member: parsed.member,
        season: parsed.season,
      });
    }
  }

  useEffect(
    () => () => {
      onShortcutFiltersChange?.({ member: [], season: [] });
    },
    [onShortcutFiltersChange],
  );

  const displayedInternalFilters = {
    ...internalFilters,
    member: [...new Set([...internalFilters.member, ...smartSearch.member])],
    season: [...new Set([...internalFilters.season, ...smartSearch.season])],
  };

  function handleInternalFiltersChange(next: ObjektFilterState) {
    setInternalFilters((current) => ({
      ...next,
      member: [
        ...new Set([
          ...current.member.filter((value) => next.member.includes(value)),
          ...next.member.filter((value) => !smartSearch.member.includes(value)),
        ]),
      ],
      season: [
        ...new Set([
          ...current.season.filter((value) => next.season.includes(value)),
          ...next.season.filter((value) => !smartSearch.season.includes(value)),
        ]),
      ],
    }));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchItems()
      .then((results) => {
        if (cancelled) return;
        setItems(results);
        setError(null);
        onLoaded?.(results.length);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load objekts",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchItems, onLoaded]);

  const filtered = useMemo(() => {
    let result = items;

    const searchText = [smartSearch.effectiveSearch, filters?.search?.trim()]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (searchText) {
      result = result.filter((o) => objektMatchesSearch(o, searchText));
    }

    const structuralFilters = {
      artist: [
        ...new Set([
          ...(filters?.artist ?? []),
          ...(showFilterBar ? internalFilters.artist : []),
        ]),
      ],
      member: [
        ...new Set([
          ...(filters?.member ?? []),
          ...(showFilterBar ? internalFilters.member : []),
          ...smartSearch.member,
        ]),
      ],
      season: [
        ...new Set([
          ...(filters?.season ?? []),
          ...(showFilterBar ? internalFilters.season : []),
          ...smartSearch.season,
        ]),
      ],
      class: [
        ...new Set([
          ...(filters?.class ?? []),
          ...(showFilterBar ? internalFilters.class : []),
        ]),
      ],
      on_offline: [
        ...new Set([
          ...(filters?.on_offline ?? []),
          ...(showFilterBar ? internalFilters.on_offline : []),
        ]),
      ],
    };
    result = result.filter((o) =>
      objektMatchesStructuralFilters(o, structuralFilters),
    );

    return result;
  }, [items, smartSearch, filters, showFilterBar, internalFilters]);

  const ordered = useMemo(() => {
    if (!prioritize) return filtered;
    const top: OwnedEntry[] = [];
    const rest: OwnedEntry[] = [];
    for (const entry of filtered) {
      (prioritize(entry) ? top : rest).push(entry);
    }
    return top.length === 0 ? filtered : [...top, ...rest];
  }, [filtered, prioritize]);

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
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => updateQuery(e.target.value)}
      />

      {showFilterBar && (
        <ObjektFilterBar
          filters={displayedInternalFilters}
          onChange={handleInternalFiltersChange}
          showSearch={false}
          showSort={false}
          showFilterMode={false}
          actions={filterBarActions}
        />
      )}

      {loading ? (
        <ObjektGridPicker
          items={[]}
          selected={selected}
          onSelect={() => {}}
          onDeselect={onDeselect}
          loading
          compareBySerial
          maxSelections={maxSelections}
          gridClassName={gridClassName}
          perRow={perRow}
          onPerRowChange={onPerRowChange}
          pageSize={pageSize}
          showSelectedRow={showSelectedRow}
          selectedRowLabel={selectedRowLabel}
          mainGridLabel={mainGridLabel}
          combineSelectedDuplicates={combineSelectedDuplicates}
        />
      ) : error ? (
        <div className="text-sm text-destructive text-center py-4">{error}</div>
      ) : items.length === 0 ? (
        (emptyState ?? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No objekts found.
          </div>
        ))
      ) : (
        <ObjektGridPicker
          items={ordered}
          selected={selected}
          onSelect={(o) => handleSelect(o as OwnedEntry)}
          onDeselect={onDeselect}
          compareBySerial
          maxSelections={maxSelections}
          emptyMessage="No matching objekts"
          gridClassName={gridClassName}
          perRow={perRow}
          onPerRowChange={onPerRowChange}
          pageSize={pageSize}
          showSelectedRow={showSelectedRow}
          selectedRowLabel={selectedRowLabel}
          mainGridLabel={mainGridLabel}
          combineSelectedDuplicates={combineSelectedDuplicates}
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
