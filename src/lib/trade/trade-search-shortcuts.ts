import {
  resolveMemberCasing,
  shortformMembers,
  validSeasons,
} from "@/lib/filters";
import { resolveObjektMemberAlias } from "@/lib/objekt-search";
import { seasonPrefixMap } from "@/lib/season-prefix";

const FILTER_MODE_TOKENS: Record<string, "haves" | "wants"> = {
  h: "haves",
  have: "haves",
  haves: "haves",
  w: "wants",
  want: "wants",
  wants: "wants",
};

// artms/tripleS seasons (Atom, Binary, Cream, Divine, Ever) use a
// repeated-initial scheme (Atom01 -> a, Atom02 -> aa, ...) generated
// generically in seasonPrefixMap for every generation, not just the ones
// released so far. A prefix belongs to that scheme (as opposed to idntt's
// explicit codes like "w"/"sp") iff its doubled form is also in the map.
const REPEATED_LETTER_SEASON_ENTRIES = Object.entries(seasonPrefixMap).filter(
  ([prefix]) =>
    /^([a-z])\1*$/i.test(prefix) &&
    `${prefix.charAt(0)}${prefix.charAt(0)}` in seasonPrefixMap,
);

const SEASON_CODE_TOKENS: Record<string, string> = Object.fromEntries(
  REPEATED_LETTER_SEASON_ENTRIES.map(([prefix, season]) => [
    prefix.toLowerCase(),
    season,
  ]),
);

// Non-repeated shorthand for the same scheme (a1 -> Atom01, a2 -> Atom02, ...).
const SEASON_LETTER_GENERATION_TOKENS: Record<string, string> =
  Object.fromEntries(
    REPEATED_LETTER_SEASON_ENTRIES.map(([prefix, season]) => [
      `${prefix.charAt(0).toLowerCase()}${prefix.length}`,
      season,
    ]),
  );

const EXACT_SEASON_TOKENS = new Map(
  validSeasons.map((season) => [season.toLowerCase(), season]),
);

// Single-letter season prefixes (a -> Atom01, b -> Binary01, ...) are only
// safe as season-only tokens when they don't collide with a single-letter
// member shortform (e.g. "c" already means Choerry) or a filter-mode token
// ("h"/"w"). Multi-letter prefixes (aa, cc, ...) never collide, so they're
// always included.
const RESERVED_SINGLE_LETTER_TOKENS = new Set([
  ...Object.keys(shortformMembers).filter((key) => key.length === 1),
  ...Object.keys(FILTER_MODE_TOKENS).filter((key) => key.length === 1),
]);

const SEASON_ONLY_TOKENS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(seasonPrefixMap)
      .filter(
        ([prefix]) =>
          prefix.length >= 2 ||
          !RESERVED_SINGLE_LETTER_TOKENS.has(prefix.toLowerCase()),
      )
      .map(([prefix, season]) => [prefix.toLowerCase(), season]),
  ),
  ...SEASON_LETTER_GENERATION_TOKENS,
};

export type ObjektSearchShortcutChip = {
  key: string;
  kind: "mode" | "member" | "season" | "collection";
  value: string;
  label: string;
  hint: string;
};

export type TradeSearchShortcutChip = ObjektSearchShortcutChip;

export type TradeSearchShortcutParseResult = {
  filterMode?: "haves" | "wants";
  member: string[];
  season: string[];
  effectiveSearch: string;
  freeTextSearch: string;
  chips: ObjektSearchShortcutChip[];
};

type TradeSearchFilterShape = {
  search: string;
  member: string[];
  season: string[];
  filterMode: "haves" | "wants";
};

function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}

function dedupeChips(chips: ObjektSearchShortcutChip[]) {
  return chips.filter(
    (chip, index) =>
      chips.findIndex((entry) => entry.key === chip.key) === index,
  );
}

function parseCompactSeasonToken(token: string) {
  const match = token.match(/^([a-z]+)(\d{3}[a-z]?)$/i);
  if (!match) return null;

  const [, prefix = "", collectionNo = ""] = match;
  const season = SEASON_CODE_TOKENS[prefix.toLowerCase()];
  if (!season) return null;

  return {
    season,
    collectionNo: collectionNo.toUpperCase(),
  };
}

function parseCollectionToken(token: string) {
  return /^\d{3}[az]?$/i.test(token) ? token.toUpperCase() : null;
}

function parseSeasonOnlyToken(token: string) {
  return SEASON_ONLY_TOKENS[token.toLowerCase()] ?? null;
}

function resolveMemberToken(token: string) {
  return resolveObjektMemberAlias(token) ?? resolveMemberCasing(token) ?? null;
}

function parseSearchShortcuts(
  searchText: string,
  includeFilterMode: boolean,
): TradeSearchShortcutParseResult {
  const trimmed = searchText.trim();
  if (!trimmed || trimmed.includes(",")) {
    return {
      member: [],
      season: [],
      effectiveSearch: trimmed,
      freeTextSearch: trimmed,
      chips: [],
    };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const member: string[] = [];
  const season: string[] = [];
  const searchTerms: string[] = [];
  const freeTextTerms: string[] = [];
  const chips: ObjektSearchShortcutChip[] = [];
  let filterMode: "haves" | "wants" | undefined;

  for (const [index, token] of tokens.entries()) {
    const lower = token.toLowerCase();

    if (includeFilterMode && index === 0) {
      const mode = FILTER_MODE_TOKENS[lower];
      if (mode) {
        filterMode = mode;
        chips.push({
          key: `mode:${mode}`,
          kind: "mode",
          value: mode,
          label: mode === "haves" ? "Haves" : "Wants",
          hint: "Side",
        });
        continue;
      }
    }

    if (
      token.startsWith("!") ||
      token.startsWith("#") ||
      token.includes("-") ||
      token.includes(":")
    ) {
      searchTerms.push(token);
      freeTextTerms.push(token);
      continue;
    }

    const compactSeason = parseCompactSeasonToken(token);
    if (compactSeason) {
      season.push(compactSeason.season);
      searchTerms.push(compactSeason.collectionNo);
      chips.push({
        key: `season:${compactSeason.season}`,
        kind: "season",
        value: compactSeason.season,
        label: compactSeason.season,
        hint: "Season",
      });
      chips.push({
        key: `collection:${compactSeason.collectionNo}`,
        kind: "collection",
        value: compactSeason.collectionNo,
        label: compactSeason.collectionNo,
        hint: "Collection",
      });
      continue;
    }

    const collectionNo = parseCollectionToken(token);
    if (collectionNo) {
      searchTerms.push(collectionNo);
      chips.push({
        key: `collection:${collectionNo}`,
        kind: "collection",
        value: collectionNo,
        label: collectionNo,
        hint: "Collection",
      });
      continue;
    }

    const seasonOnly = parseSeasonOnlyToken(token);
    if (seasonOnly) {
      season.push(seasonOnly);
      chips.push({
        key: `season:${seasonOnly}`,
        kind: "season",
        value: seasonOnly,
        label: seasonOnly,
        hint: "Season",
      });
      continue;
    }

    const exactSeason = EXACT_SEASON_TOKENS.get(lower);
    if (exactSeason) {
      season.push(exactSeason);
      chips.push({
        key: `season:${exactSeason}`,
        kind: "season",
        value: exactSeason,
        label: exactSeason,
        hint: "Season",
      });
      continue;
    }

    const resolvedMember = resolveMemberToken(token);
    if (resolvedMember) {
      member.push(resolvedMember);
      chips.push({
        key: `member:${resolvedMember}`,
        kind: "member",
        value: resolvedMember,
        label: resolvedMember,
        hint: "Member",
      });
      continue;
    }

    searchTerms.push(token);
    freeTextTerms.push(token);
  }

  return {
    filterMode,
    member: dedupe(member),
    season: dedupe(season),
    effectiveSearch: searchTerms.join(" ").trim(),
    freeTextSearch: freeTextTerms.join(" ").trim(),
    chips: dedupeChips(chips),
  };
}

export function parseObjektSearchShortcuts(searchText: string) {
  return parseSearchShortcuts(searchText, false);
}

export function parseTradeSearchShortcuts(searchText: string) {
  return parseSearchShortcuts(searchText, true);
}

export function extractCompletedSearchShortcuts(
  searchText: string,
  options: { mode: "objekt" | "trade"; commitAll: boolean },
) {
  if (!searchText.trim() || searchText.includes(",")) return null;

  let completedText = searchText;
  let trailingText = "";

  if (!options.commitAll) {
    const match = searchText.match(/^(.*\s)(\S*)$/);
    if (!match) return null;
    completedText = match[1]?.trim() ?? "";
    trailingText = match[2] ?? "";
  }

  const parsed =
    options.mode === "trade"
      ? parseTradeSearchShortcuts(completedText)
      : parseObjektSearchShortcuts(completedText);
  const hasPromotedFilters =
    parsed.member.length > 0 ||
    parsed.season.length > 0 ||
    parsed.filterMode !== undefined;

  if (!hasPromotedFilters) return null;

  return {
    ...parsed,
    remainingSearch: [parsed.effectiveSearch, trailingText]
      .filter(Boolean)
      .join(" "),
  };
}

export function applyTradeSearchShortcuts<T extends TradeSearchFilterShape>(
  filters: T,
): T {
  const parsed = parseTradeSearchShortcuts(filters.search);

  return {
    ...filters,
    search: parsed.effectiveSearch,
    member: dedupe([...filters.member, ...parsed.member]),
    season: dedupe([...filters.season, ...parsed.season]),
    filterMode: parsed.filterMode ?? filters.filterMode,
  };
}
