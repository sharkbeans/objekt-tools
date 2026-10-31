import { normalizeArtistId } from "@/lib/artist-utils";
import { decodeGroupedValue } from "@/lib/filter-utils";
import {
  parseObjektSearchGroups,
  resolveObjektMemberAlias,
} from "@/lib/objekt-search";

// The inventory search and filters, evaluated in memory. This is the same
// predicate buildInventoryConditions() in indexer-owned-objekts.ts builds as
// SQL, for rows read from the objekt.top API while the indexer is down; keep
// the two in step.

export type InventoryFilters = {
  query?: string;
  artist?: string[];
  member?: string[];
  season?: string[];
  class?: string[];
  onOffline?: string[];
};

export type InventoryFilterRow = {
  collectionId: string;
  artist: string;
  member: string;
  collectionNo: string;
  season: string;
  class: string;
  onOffline: string;
  serial: number;
};

export type CollectionRange = {
  start: {
    seasonCode: string;
    seasonNumber: number;
    collectionNo: string;
    type: string;
  };
  end: {
    seasonCode: string;
    seasonNumber: number;
    collectionNo: string;
    type: string;
  };
};

export function parseCollectionRange(term: string): CollectionRange | null {
  const match = term.match(/^([a-z]*)(\d{3})([az]?)-([a-z]*)(\d{3})([az]?)$/i);
  if (!match) return null;
  const [
    ,
    startPrefix = "",
    startNo = "",
    startType = "",
    endPrefix = "",
    endNo = "",
    endType = "",
  ] = match;
  return {
    start: {
      seasonCode: startPrefix.charAt(0).toLowerCase(),
      seasonNumber: startPrefix.length,
      collectionNo: startNo,
      type: startType.toLowerCase(),
    },
    end: {
      seasonCode: endPrefix.charAt(0).toLowerCase(),
      seasonNumber: endPrefix.length,
      collectionNo: endNo,
      type: endType.toLowerCase(),
    },
  };
}

export function toSeasonRangeKey(code: string, number: number) {
  return `${String(number).padStart(2, "0")}${code.toLowerCase()}`;
}

/** The season bounds of a range, or null when the range names no season. */
export function seasonRangeBounds(
  range: CollectionRange,
): { start: string; end: string } | null {
  if (!range.start.seasonNumber && !range.end.seasonNumber) return null;
  return {
    start: toSeasonRangeKey(
      range.start.seasonCode || range.end.seasonCode || "a",
      range.start.seasonNumber || range.end.seasonNumber,
    ),
    end: toSeasonRangeKey(
      range.end.seasonCode || range.start.seasonCode || "z",
      range.end.seasonNumber || range.start.seasonNumber || 99,
    ),
  };
}

export function toIndexerArtist(artist: string) {
  const normalized = normalizeArtistId(artist);
  return normalized === "tripleS" ? "triples" : normalized;
}

function between(value: string, low: string, high: string) {
  return value >= low && value <= high;
}

// ILIKE: case-insensitive, `%` any run, `_` one character, `\` escapes.
function likeToRegExp(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\" && i + 1 < pattern.length) {
      i++;
      source += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (char === "%") {
      source += ".*";
    } else if (char === "_") {
      source += ".";
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, "is");
}

function matchesSearchTerm(row: InventoryFilterRow, term: string): boolean {
  const serialMatch = term.match(/^#(\d+)(?:-(\d+))?$/);
  if (serialMatch) {
    const start = Number(serialMatch[1]);
    const end = Number(serialMatch[2] ?? serialMatch[1]);
    return (
      row.serial >= Math.min(start, end) && row.serial <= Math.max(start, end)
    );
  }

  const range = parseCollectionRange(term);
  if (range) {
    const collectionNo = row.collectionNo.toLowerCase();
    if (
      !between(
        collectionNo.slice(0, 3),
        range.start.collectionNo,
        range.end.collectionNo,
      )
    ) {
      return false;
    }
    if (
      !between(
        collectionNo.charAt(3) || "a",
        range.start.type || "a",
        range.end.type || range.start.type || "z",
      )
    ) {
      return false;
    }
    const seasons = seasonRangeBounds(range);
    if (seasons) {
      const season = row.season.toLowerCase();
      const key = season.slice(-2) + season.slice(0, 1);
      if (!between(key, seasons.start, seasons.end)) return false;
    }
    return true;
  }

  const classShortcut = term.match(/^([a-z])co$/i);
  if (classShortcut) {
    return (
      row.class.toLowerCase().charAt(0) === classShortcut[1]?.toLowerCase()
    );
  }

  const memberAlias = resolveObjektMemberAlias(term);
  if (memberAlias && row.member === memberAlias) return true;
  const pattern = likeToRegExp(`%${term}%`);
  return [
    row.member,
    row.collectionId,
    row.collectionNo,
    row.season,
    row.class,
    row.artist,
  ].some((value) => pattern.test(value));
}

function matchesSearch(row: InventoryFilterRow, query: string): boolean {
  const groups = parseObjektSearchGroups(query);
  if (groups.length === 0) return true;
  return groups.some((group) =>
    group.every((rawTerm) => {
      const excluded = rawTerm.startsWith("!");
      const term = excluded ? rawTerm.slice(1) : rawTerm;
      const matched = matchesSearchTerm(row, term);
      return excluded ? !matched : matched;
    }),
  );
}

function matchesGrouped(
  row: InventoryFilterRow,
  field: "season" | "class",
  values: string[],
): boolean {
  if (values.length === 0) return true;
  return values.some((value) => {
    const grouped = decodeGroupedValue(value);
    return grouped
      ? row.artist === toIndexerArtist(grouped.artistId) &&
          row[field] === grouped.item
      : row[field] === value;
  });
}

export function matchesInventoryFilters(
  row: InventoryFilterRow,
  filters: InventoryFilters,
): boolean {
  if (!matchesSearch(row, filters.query ?? "")) return false;
  if (
    filters.artist?.length &&
    !filters.artist.map(toIndexerArtist).includes(row.artist)
  ) {
    return false;
  }
  if (filters.member?.length && !filters.member.includes(row.member)) {
    return false;
  }
  if (!matchesGrouped(row, "season", filters.season ?? [])) return false;
  if (!matchesGrouped(row, "class", filters.class ?? [])) return false;
  const onlineTypes: string[] = (filters.onOffline ?? []).filter(
    (value) => value === "online" || value === "offline",
  );
  if (onlineTypes.length && !onlineTypes.includes(row.onOffline)) return false;
  return true;
}
