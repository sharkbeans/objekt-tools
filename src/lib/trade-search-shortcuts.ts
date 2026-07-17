import { resolveMemberCasing, validSeasons } from "@/lib/filters";
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

const SEASON_CODE_TOKENS: Record<string, string> = {
  a: "Atom01",
  aa: "Atom02",
  b: "Binary01",
  bb: "Binary02",
  c: "Cream01",
  cc: "Cream02",
  d: "Divine01",
  e: "Ever01",
};

const EXACT_SEASON_TOKENS = new Map(
  validSeasons.map((season) => [season.toLowerCase(), season]),
);

const SEASON_ONLY_TOKENS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(seasonPrefixMap)
      .filter(([prefix]) => prefix.length >= 2)
      .map(([prefix, season]) => [prefix.toLowerCase(), season]),
  ),
  a1: "Atom01",
  a2: "Atom02",
  b1: "Binary01",
  b2: "Binary02",
  c1: "Cream01",
  c2: "Cream02",
  d1: "Divine01",
  e1: "Ever01",
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
