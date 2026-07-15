import { artistMatches, normalizeArtistId } from "@/lib/artist-utils";
import { membersByArtist, type ValidArtist } from "@/lib/filters";
import {
  makeObjektSearchTags,
  type ObjektSearchItem,
  objektSearchTermMatches,
  parseObjektSearchGroups,
} from "@/lib/objekt-search";
import { decodeGroupedValue } from "./grouped";
import type { ObjektStructuralFilters } from "./types";

export type TradeFilterItem = ObjektSearchItem;

// ============================================================
// Tag generation / search — thin wrappers over objekt-search.ts
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
// Structural filter predicate — the single grouped-value-aware matcher,
// shared by the JS predicate below, the pickers, and progress rollups.
// ============================================================

export function structuralFieldsMatch(
  filters: ObjektStructuralFilters,
  fields: {
    artist: string;
    member?: string | null;
    season?: string | null;
    class?: string | null;
    onOffline: "online" | "offline";
  },
): boolean {
  const itemArtist = normalizeArtistId(fields.artist);

  if (
    filters.artist.length &&
    !filters.artist.some((a) => artistMatches(a, itemArtist))
  )
    return false;

  if (filters.member.length) {
    if (!fields.member || !filters.member.includes(fields.member)) return false;
  }

  if (filters.season.length) {
    const matches = filters.season.some((s) => {
      const decoded = decodeGroupedValue(s);
      return decoded
        ? decoded.item === fields.season &&
            normalizeArtistId(decoded.artistId) === itemArtist
        : s === fields.season;
    });
    if (!matches) return false;
  }

  if (filters.class.length) {
    const matches = filters.class.some((c) => {
      const decoded = decodeGroupedValue(c);
      return decoded
        ? decoded.item === fields.class &&
            normalizeArtistId(decoded.artistId) === itemArtist
        : c === fields.class;
    });
    if (!matches) return false;
  }

  if (filters.on_offline.length) {
    if (!filters.on_offline.includes(fields.onOffline)) return false;
  }

  return true;
}

export function objektMatchesStructuralFilters(
  item: TradeFilterItem,
  filters: ObjektStructuralFilters,
): boolean {
  const artist = normalizeArtistId(
    (item.member ? getArtistForMember(item.member) : null) ?? item.artist,
  );

  return structuralFieldsMatch(filters, {
    artist,
    member: item.member,
    season: item.season,
    class: item.class,
    onOffline: getOnOffline(item),
  });
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
  filters: ObjektStructuralFilters & { search?: string | null },
  filterMode: "haves" | "wants" | "both" = "both",
): boolean {
  const allItems =
    filterMode === "haves"
      ? trade.haves
      : filterMode === "wants"
        ? trade.wants
        : [...trade.haves, ...trade.wants];

  // Quick-search: same OR/AND/NOT grammar as objekt-search.ts, strict (no fuzzy)
  const queries = parseObjektSearchGroups(filters.search ?? "");

  if (queries.length > 0) {
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

  const hasStructuralFilter =
    filters.artist.length > 0 ||
    filters.member.length > 0 ||
    filters.season.length > 0 ||
    filters.class.length > 0 ||
    filters.on_offline.length > 0;

  if (hasStructuralFilter) {
    const anyItemMatches = allItems.some((item) =>
      objektMatchesStructuralFilters(item, filters),
    );
    if (!anyItemMatches) return false;
  }

  return true;
}
