"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useObjektCatalog } from "@/hooks/use-objekt-catalog";
import type { ObjektEntry } from "@/lib/cosmo/types";
import {
  type ObjektStructuralFilters,
  objektMatchesStructuralFilters,
} from "@/lib/objekt-filters";
import {
  objektMatchesSearchGroups,
  parseObjektSearchGroups,
} from "@/lib/objekt-search";
import { ObjektGridPicker } from "./objekt-grid-picker";

const MAX_RESULTS = 500;

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
  /** When true, merges duplicate selected entries into one card with a quantity badge. */
  combineSelectedDuplicates?: boolean;
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
  combineSelectedDuplicates = false,
}: ObjektPickerProps) {
  const { data: catalog = [], isLoading } = useObjektCatalog();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timeout);
  }, [query]);

  const filtersActive = hasActiveFilters(filters);
  const effectiveQuery =
    debouncedQuery.trim() || (filters?.search?.trim() ?? "");
  const showList = filtersActive || effectiveQuery.length > 0;

  const displayResults = useMemo(() => {
    if (!showList) return [];

    let items = catalog;
    if (filters) {
      items = items.filter((o) => objektMatchesStructuralFilters(o, filters));
    }
    if (effectiveQuery) {
      const groups = parseObjektSearchGroups(effectiveQuery);
      items = items.filter((o) => objektMatchesSearchGroups(o, groups, o.tags));
    }
    return items.slice(0, MAX_RESULTS);
  }, [catalog, filters, effectiveQuery, showList]);

  function handleSelect(entry: ObjektEntry) {
    const isSelected = selected.some(
      (s) => s.collectionId === entry.collectionId,
    );
    if (isSelected || selected.length >= maxSelections) return;
    onSelect(entry);
  }

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
          combineSelectedDuplicates={combineSelectedDuplicates}
        />
      ) : (
        <ObjektGridPicker
          items={displayResults}
          selected={selected}
          onSelect={handleSelect}
          onDeselect={onDeselect}
          loading={isLoading}
          maxSelections={maxSelections}
          emptyMessage="No results found"
          gridClassName={gridClassName}
          showSelectedRow={showSelectedRow}
          selectedRowLabel={selectedRowLabel}
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
