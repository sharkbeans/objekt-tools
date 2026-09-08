import type { ParsedItem } from "@/lib/paste-parser";
import { getSeasonPrefix } from "@/lib/season-prefix";
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
  members: Set<string>;
  seasons: Set<string>;
  terms: string[];
}

export function parseDeskQuery(search: string): DeskQuery {
  const parsed = parseTradeSearchShortcuts(search);
  return {
    members: new Set(parsed.member.map((m) => m.toLowerCase())),
    seasons: new Set(parsed.season.map((s) => s.toLowerCase())),
    terms: parsed.effectiveSearch.toLowerCase().split(/\s+/).filter(Boolean),
  };
}

export function matchesDeskQuery(item: ParsedItem, query: DeskQuery): boolean {
  const { member, season, collectionNo } = item;
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
