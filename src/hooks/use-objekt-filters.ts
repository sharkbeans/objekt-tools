"use client";

import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import type { ObjektFilterState } from "@/components/objekt/objekt-filter-bar";
import { validSorts } from "@/lib/filters";

const filterModeValues = ["haves", "wants"] as const;

// One parser set shared by every page that renders <ObjektFilterBar>, so
// filter state always lives in the URL: shareable links, working
// back/forward, and survives a refresh. `sort`/`filterMode` are constrained
// enums (bad URL values fall back to the default); the multi-select fields
// stay plain string arrays to match `ObjektFilterState`, same as MultiSelect's
// own `(value: string[]) => void` onChange.
const filterParsers = {
  search: parseAsString.withDefault(""),
  artist: parseAsArrayOf(parseAsString).withDefault([]),
  member: parseAsArrayOf(parseAsString).withDefault([]),
  season: parseAsArrayOf(parseAsString).withDefault([]),
  class: parseAsArrayOf(parseAsString).withDefault([]),
  on_offline: parseAsArrayOf(parseAsString).withDefault([]),
  sort: parseAsStringEnum([...validSorts]).withDefault("newest"),
  filterMode: parseAsStringEnum([...filterModeValues]).withDefault("haves"),
};

/**
 * URL-backed replacement for `useState<ObjektFilterState>`. Returns the same
 * `[filters, setFilters]` shape `<ObjektFilterBar>` already expects, so call
 * sites swap the hook without touching the component.
 */
export function useObjektFilters(options?: {
  /** Reset to page 1 (or similar) whenever any filter value changes. */
  onChange?: () => void;
}) {
  const [state, setState] = useQueryStates(filterParsers, {
    history: "replace",
    clearOnDefault: true,
  });

  const filters: ObjektFilterState = state;

  const setFilters = (next: ObjektFilterState) => {
    setState(next);
    options?.onChange?.();
  };

  return [filters, setFilters] as const;
}
