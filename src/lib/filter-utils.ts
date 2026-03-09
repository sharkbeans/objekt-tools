/**
 * Filter utilities for trade posts.
 *
 * The tag generation and quick-search parsing logic is ported directly from
 * objekt-explorer (apps/web/src/lib/filter-utils.ts and objekt-utils.ts) so
 * that the backend filtering behaviour is identical.
 */

import { shortformMembers, membersByArtist, type ValidArtist } from "./filters";

// ============================================================
// Types
// ============================================================

export type TradeFilterItem = {
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  season?: string | null;
  class?: string | null;
  serial?: number | null;
};

export type TradeFilters = {
  artist?: string[];
  member?: string[];
  season?: string[];
  class?: string[];
  on_offline?: string[];
  search?: string | null;
  sort?: string | null;
};

// ============================================================
// Tag generation — ported from objekt-explorer makeCollectionTags
// ============================================================

function getMemberShortKeys(value: string): string[] {
  return Object.keys(shortformMembers).filter((key) => shortformMembers[key] === value);
}

export function makeTradeItemTags(item: TradeFilterItem): string[] {
  if (!item.member || !item.season || !item.class || !item.collectionNo) {
    return [item.collectionId.toLowerCase()];
  }

  const member = item.member;
  const season = item.season;
  const className = item.class;
  const collectionNo = item.collectionNo;

  const seasonCode = season.charAt(0);
  const seasonNumber = season.slice(-2);
  const seasonCodeRepeated = seasonCode.repeat(Number(seasonNumber));
  const collectionNoSliced = collectionNo.slice(0, -1); // strip trailing type char

  // Determine artist from member for tag inclusion
  const artist = getArtistForMember(member);

  return [
    ...getMemberShortKeys(member),
    ...(artist ? [artist] : []),
    collectionNo,                            // 201z
    ...(artist !== "idntt"
      ? [
          `${seasonCodeRepeated}${collectionNo}`,      // a201z, aa201z
          `${seasonCodeRepeated}${collectionNoSliced}`, // a201, aa201
        ]
      : []),
    collectionNoSliced,                      // 201
    member.toLowerCase(),
    className.toLowerCase(),
    `${className.charAt(0).toLowerCase()}co`, // sco, fco, dco …
    season.toLowerCase(),                    // atom01
    season.slice(0, -2).toLowerCase(),       // atom
    seasonCode.toLowerCase() + seasonNumber, // a01
    seasonCode.toLowerCase() + Number(seasonNumber), // a1
  ]
    .filter(Boolean)
    .map((a) => a.toLowerCase());
}

// ============================================================
// Quick-search parsing — ported from objekt-explorer searchFilter
// ============================================================

function parseCollectionNo(value: string) {
  const expression = /^([a-zA-Z]*)(\d{3})([azAZ]?)$/;
  const match = value.match(expression);
  if (!match) return null;
  const [, seasonCode = "", collectionNo = "", type = ""] = match;
  return {
    seasonCode: seasonCode.length > 0 ? seasonCode.charAt(0) : "",
    seasonNumber: seasonCode.length,
    collectionNo,
    type,
  };
}

function parseSerial(value: string) {
  const expression = /\d+/;
  const match = value.match(expression);
  if (!match) return null;
  return Number(match[0]);
}

function getItemBreakdown(item: TradeFilterItem) {
  if (!item.collectionNo || !item.season) return null;
  return {
    collectionNo: item.collectionNo.substring(0, 3).toLowerCase(),
    seasonCode: item.season.charAt(0).toLowerCase(),
    seasonNumber: Number(item.season.slice(-2)),
    type: item.collectionNo.charAt(3).toLowerCase(),
  };
}

function toSeasonKey(seasonCode: string, seasonNumber: number) {
  return String(seasonNumber).padStart(2, "0") + seasonCode;
}

export function searchFilter(keyword: string, item: TradeFilterItem, tags: string[]): boolean {
  // Serial search (#1-20) — only applies to have items that have a serial
  if (keyword.startsWith("#")) {
    if (item.serial == null) return false;
    const [start, end] = keyword.split("-").map(parseSerial);
    if (!start) return false;
    return item.serial >= start && item.serial <= (end ?? start);
  }

  // Collection range search (301z-302z, aa201z-204z, a201z-aa204z)
  if (keyword.includes("-")) {
    const [start, end] = keyword.split("-").map(parseCollectionNo);
    if (!start || !end) return false;

    const breakdown = getItemBreakdown(item);
    if (!breakdown) return false;

    const hasSeason = start.seasonNumber > 0 || end.seasonNumber > 0;

    if (hasSeason) {
      const startSeasonKey = toSeasonKey(
        start.seasonCode || end.seasonCode || "a",
        start.seasonNumber || end.seasonNumber,
      );
      const endSeasonKey = toSeasonKey(
        end.seasonCode || start.seasonCode || "z",
        end.seasonNumber || start.seasonNumber || 99,
      );
      const objectSeasonKey = toSeasonKey(breakdown.seasonCode, breakdown.seasonNumber);
      if (objectSeasonKey < startSeasonKey || objectSeasonKey > endSeasonKey) return false;
    }

    return (
      breakdown.collectionNo >= start.collectionNo &&
      breakdown.collectionNo <= end.collectionNo &&
      breakdown.type >= (start.type || "a") &&
      breakdown.type <= (end.type || start.type || "z")
    );
  }

  // Tag matching
  return tags.some((value) => value === keyword);
}

// ============================================================
// Online/offline detection
// ============================================================

function getOnOffline(item: TradeFilterItem): "online" | "offline" {
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
  tags: string[],
): boolean {
  // Member filter
  if (filters.member?.length) {
    if (!item.member || !filters.member.includes(item.member)) return false;
  }

  // Season filter
  if (filters.season?.length) {
    if (!item.season || !filters.season.includes(item.season)) return false;
  }

  // Class filter
  if (filters.class?.length) {
    if (!item.class || !filters.class.includes(item.class)) return false;
  }

  // Artist filter (resolved via member → artist mapping)
  if (filters.artist?.length) {
    const itemArtist = item.member ? getArtistForMember(item.member) : null;
    if (!itemArtist || !filters.artist.includes(itemArtist)) return false;
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
    const anyItemMatches = allItems.some((item) => {
      const tags = makeTradeItemTags(item);
      return itemMatchesFilters(item, filters, tags);
    });
    if (!anyItemMatches) return false;
  }

  return true;
}
