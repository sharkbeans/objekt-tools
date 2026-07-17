/**
 * Filter utilities for trade posts.
 *
 * The tag generation and quick-search parsing logic is ported directly from
 * objekt-explorer (apps/web/src/lib/filter-utils.ts and objekt-utils.ts) so
 * that the backend filtering behaviour is identical.
 */

import { artistMatches, normalizeArtistId } from "@/lib/artist-utils";
import {
  makeObjektSearchTags,
  type ObjektSearchItem,
  objektSearchTermMatches,
} from "@/lib/objekt-search";
import { membersByArtist, type ValidArtist } from "./filters";

// ============================================================
// Types
// ============================================================

export type TradeFilterItem = ObjektSearchItem;

export type TradeFilters = {
  artist?: string[];
  member?: string[];
  season?: string[];
  class?: string[];
  on_offline?: string[];
  search?: string | null;
  sort?: string | null;
};

/** Structural filters used by the inventory/global pickers. */
export type ObjektStructuralFilters = {
  artist: string[];
  member: string[];
  season: string[];
  class: string[];
  on_offline: string[];
  search?: string;
};

// ============================================================
// Grouped values — season/class filter values are scoped per-artist and
// encoded as "artistId::value" (e.g. "tripleS::Atom01") to disambiguate
// identically-named values across artists.
// ============================================================

export function encodeGroupedValue(artistId: string, item: string) {
  return `${artistId}::${item}`;
}

export function decodeGroupedValue(
  value: string,
): { artistId: string; item: string } | null {
  const idx = value.indexOf("::");
  if (idx === -1) return null;
  return { artistId: value.slice(0, idx), item: value.slice(idx + 2) };
}

// ============================================================
// Tag generation — ported from objekt-explorer makeCollectionTags
// ============================================================

export function makeTradeItemTags(item: TradeFilterItem): string[] {
  return makeObjektSearchTags({
    ...item,
    artist:
      item.artist ?? (item.member ? getArtistForMember(item.member) : null),
  });
}

export function searchFilter(
  keyword: string,
  item: TradeFilterItem,
  tags: string[],
): boolean {
  return objektSearchTermMatches(keyword, item, tags, { fuzzy: false });
}

// ============================================================
// Online/offline detection
// ============================================================

export function getOnOffline(item: TradeFilterItem): "online" | "offline" {
  if (item.collectionNo) {
    return item.collectionNo.toLowerCase().endsWith("z") ? "offline" : "online";
  }
  // Fall back to collectionId heuristic (offline IDs end with 'z')
  return item.collectionId.endsWith("z") ? "offline" : "online";
}

// ============================================================
// Artist lookup
// ============================================================

export function getArtistForMember(member: string): ValidArtist | null {
  for (const [artist, members] of Object.entries(membersByArtist)) {
    if (members.includes(member)) return artist as ValidArtist;
  }
  return null;
}

// ============================================================
// Structural filter predicate — shared by the inventory/global pickers
// (owned inventory, Cosmo-nickname inventory, catalog search results).
// ============================================================

export function objektMatchesStructuralFilters(
  item: TradeFilterItem,
  filters: ObjektStructuralFilters,
): boolean {
  const itemArtist = normalizeArtistId(
    (item.member ? getArtistForMember(item.member) : null) ?? item.artist,
  );

  if (
    filters.artist.length &&
    !filters.artist.some((a) => artistMatches(a, itemArtist))
  )
    return false;

  if (filters.member.length) {
    if (!item.member || !filters.member.includes(item.member)) return false;
  }

  if (filters.season.length) {
    const matches = filters.season.some((s) => {
      const decoded = decodeGroupedValue(s);
      return decoded
        ? decoded.item === item.season &&
            normalizeArtistId(decoded.artistId) === itemArtist
        : s === item.season;
    });
    if (!matches) return false;
  }

  if (filters.class.length) {
    const matches = filters.class.some((c) => {
      const decoded = decodeGroupedValue(c);
      return decoded
        ? decoded.item === item.class &&
            normalizeArtistId(decoded.artistId) === itemArtist
        : c === item.class;
    });
    if (!matches) return false;
  }

  if (filters.on_offline.length) {
    if (!filters.on_offline.includes(getOnOffline(item))) return false;
  }

  return true;
}

// ============================================================
// URL param parsing + filter helpers
// ============================================================

export function parseFiltersFromParams(params: URLSearchParams): TradeFilters {
  return {
    artist: params.getAll("artist").filter(Boolean),
    member: params.getAll("member").filter(Boolean),
    season: params.getAll("season").filter(Boolean),
    class: params.getAll("class").filter(Boolean),
    on_offline: params.getAll("on_offline").filter(Boolean),
    search: params.get("search") ?? "",
  };
}

export function hasAnyFilter(filters: TradeFilters): boolean {
  return (
    (filters.artist?.length ?? 0) > 0 ||
    (filters.member?.length ?? 0) > 0 ||
    (filters.season?.length ?? 0) > 0 ||
    (filters.class?.length ?? 0) > 0 ||
    (filters.on_offline?.length ?? 0) > 0 ||
    !!filters.search
  );
}

// ============================================================
// Item-level filter
// ============================================================

function itemMatchesFilters(
  item: TradeFilterItem,
  filters: TradeFilters,
): boolean {
  const itemArtist = normalizeArtistId(
    (item.member ? getArtistForMember(item.member) : null) ?? item.artist,
  );

  // Member filter
  if (filters.member?.length) {
    if (!item.member || !filters.member.includes(item.member)) return false;
  }

  // Season filter
  if (filters.season?.length) {
    const matches = filters.season.some((s) => {
      const decoded = decodeGroupedValue(s);
      return decoded
        ? decoded.item === item.season &&
            normalizeArtistId(decoded.artistId) === itemArtist
        : s === item.season;
    });
    if (!matches) return false;
  }

  // Class filter
  if (filters.class?.length) {
    const matches = filters.class.some((c) => {
      const decoded = decodeGroupedValue(c);
      return decoded
        ? decoded.item === item.class &&
            normalizeArtistId(decoded.artistId) === itemArtist
        : c === item.class;
    });
    if (!matches) return false;
  }

  // Artist filter (resolved via member → artist mapping)
  if (filters.artist?.length) {
    if (
      !itemArtist ||
      !filters.artist.some((artist) => artistMatches(artist, itemArtist))
    )
      return false;
  }

  // Online/offline filter
  if (filters.on_offline?.length) {
    const onOffline = getOnOffline(item);
    if (!filters.on_offline.includes(onOffline)) return false;
  }

  return true;
}

// ============================================================
// Trade-post level filter — a post matches if ANY of its items matches
// ============================================================

type TradePost = {
  haves: TradeFilterItem[];
  wants: TradeFilterItem[];
};

export function tradeMatchesFilters(
  trade: TradePost,
  filters: TradeFilters,
  filterMode: "haves" | "wants" | "both" = "both",
): boolean {
  const allItems =
    filterMode === "haves"
      ? trade.haves
      : filterMode === "wants"
        ? trade.wants
        : [...trade.haves, ...trade.wants];

  // Quick-search: parse with the same OR/AND/NOT grammar as objekt-explorer
  const queries = (filters.search ?? "")
    .toLowerCase()
    .split(",")
    .map((group) =>
      group
        .trim()
        .split(" ")
        .map((term) => term.trim())
        .filter(Boolean),
    )
    .filter((group) => group.length > 0);

  if (queries.length > 0) {
    // At least one OR-group must match some item
    const searchMatches = queries.some((group) =>
      allItems.some((item) => {
        const tags = makeTradeItemTags(item);
        return group.every((term) =>
          term.startsWith("!")
            ? !searchFilter(term.slice(1), item, tags)
            : searchFilter(term, item, tags),
        );
      }),
    );
    if (!searchMatches) return false;
  }

  // Structural filters: at least one item across haves+wants must match
  const hasStructuralFilter =
    (filters.artist?.length ?? 0) > 0 ||
    (filters.member?.length ?? 0) > 0 ||
    (filters.season?.length ?? 0) > 0 ||
    (filters.class?.length ?? 0) > 0 ||
    (filters.on_offline?.length ?? 0) > 0;

  if (hasStructuralFilter) {
    const anyItemMatches = allItems.some((item) =>
      itemMatchesFilters(item, filters),
    );
    if (!anyItemMatches) return false;
  }

  return true;
}
