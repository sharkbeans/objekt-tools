"use client";

import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { defaultFilters } from "@/lib/objekt-filters";

const filterParsers = {
  search: parseAsString.withDefault(defaultFilters.search),
  artist: parseAsArrayOf(parseAsString).withDefault(defaultFilters.artist),
  member: parseAsArrayOf(parseAsString).withDefault(defaultFilters.member),
  season: parseAsArrayOf(parseAsString).withDefault(defaultFilters.season),
  class: parseAsArrayOf(parseAsString).withDefault(defaultFilters.class),
  on_offline: parseAsArrayOf(parseAsString).withDefault(
    defaultFilters.on_offline,
  ),
  sort: parseAsString.withDefault(defaultFilters.sort),
  filterMode: parseAsStringEnum(["haves", "wants"]).withDefault(
    defaultFilters.filterMode,
  ),
};

/**
 * URL-backed objekt filter state (search/artist/member/season/class/
 * on_offline/sort/filterMode) for page-level browse surfaces — the URL is
 * the single source of truth, so filters survive reload/back-navigation
 * and are shareable. `filterMode` keeps its existing `filter_mode` query
 * param name for link back-compat.
 */
export function useObjektFilterParams() {
  return useQueryStates(filterParsers, {
    urlKeys: { filterMode: "filter_mode" },
    history: "replace",
  });
}
