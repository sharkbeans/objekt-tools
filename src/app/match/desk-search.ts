import { parseOffering } from "@/lib/discord/match";
import type { ParsedItem } from "@/lib/paste-parser";
import { getSeasonPrefix, stripVariantSuffix } from "@/lib/season-prefix";
import { parseTradeSearchShortcuts } from "@/lib/trade/trade-search-shortcuts";

/**
 * Each grid's search, sharing the shortcut grammar used on trades and lists —
 * "sy cc101", "jw a201z", a bare season code — so the syntax a trader already
 * knows works here too.
 *
 * It deliberately does not mount the full `ObjektFilterBar`. That bar also
 * offers artist, class and on/offline dropdowns, and a pasted list carries
 * none of those fields: every one of them would filter the grid to nothing.
 * Only the parts the pasted data can actually answer are offered.
 */

export interface DeskQuery {
  alternatives: ParsedItem[];
  members: Set<string>;
  seasons: Set<string>;
  terms: string[];
}

export function parseDeskQuery(search: string): DeskQuery {
  const parsed = parseTradeSearchShortcuts(search);
  return {
    // Preserve member/season pairs and inherited codes from the want list.
    // Each listed card is an alternative, not a required bundle.
    alternatives: parseOffering(search).filter(
      (item) =>
        item.season && item.collectionNo && !item.isAny && !item.freeform,
    ),
    members: new Set(parsed.member.map((m) => m.toLowerCase())),
    seasons: new Set(parsed.season.map((s) => s.toLowerCase())),
    terms: parsed.effectiveSearch.toLowerCase().split(/\s+/).filter(Boolean),
  };
}

export function matchesDeskQuery(item: ParsedItem, query: DeskQuery): boolean {
  const { member, season, collectionNo } = item;
  if (query.alternatives.length) {
    return query.alternatives.some(
      (wanted) =>
        (!wanted.member ||
          wanted.member.toLowerCase() === member?.toLowerCase()) &&
        wanted.season?.toLowerCase() === season?.toLowerCase() &&
        stripVariantSuffix(wanted.collectionNo ?? "").toLowerCase() ===
          stripVariantSuffix(collectionNo ?? "").toLowerCase(),
    );
  }
  if (query.members.size > 0) {
    if (!member || !query.members.has(member.toLowerCase())) return false;
  }
  if (query.seasons.size > 0) {
    if (!season || !query.seasons.has(season.toLowerCase())) return false;
  }
  if (query.terms.length === 0) return true;

  const prefix = getSeasonPrefix(season);
  const haystack = [member, season, collectionNo, `${prefix}${collectionNo}`]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return query.terms.every((term) => haystack.includes(term));
}

/**
 * The same cards with those matching `query` moved to the front, each group
 * keeping its order. How a Discord search stays a highlight on the desk rather
 * than a filter: what was searched for leads, and everything else the capture
 * turned up is still there behind it.
 */
export function pinMatches<T extends { item: ParsedItem }>(
  cards: readonly T[],
  query: DeskQuery | null,
): T[] {
  if (!query) return [...cards];
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const card of cards)
    (matchesDeskQuery(card.item, query) ? pinned : rest).push(card);
  return [...pinned, ...rest];
}
