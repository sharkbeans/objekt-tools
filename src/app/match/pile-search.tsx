"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PileEntry } from "@/lib/discord/match";
import { getSeasonPrefix } from "@/lib/season-prefix";
import { parseTradeSearchShortcuts } from "@/lib/trade/trade-search-shortcuts";

/**
 * The pile's search, sharing the shortcut grammar used on trades and lists —
 * "sy cc101", "jw a201z", a bare season code — so the syntax a trader already
 * knows works here too.
 *
 * It deliberately does not mount the full `ObjektFilterBar`. That bar also
 * offers artist, class and on/offline dropdowns, and a pasted list carries
 * none of those fields: every one of them would filter the pile to nothing.
 * Only the parts the pasted data can actually answer are offered.
 */

export interface PileQuery {
  members: Set<string>;
  seasons: Set<string>;
  terms: string[];
}

export function parsePileQuery(search: string): PileQuery {
  const parsed = parseTradeSearchShortcuts(search);
  return {
    members: new Set(parsed.member.map((m) => m.toLowerCase())),
    seasons: new Set(parsed.season.map((s) => s.toLowerCase())),
    terms: parsed.effectiveSearch.toLowerCase().split(/\s+/).filter(Boolean),
  };
}

export function matchesPileQuery(entry: PileEntry, query: PileQuery): boolean {
  const { member, season, collectionNo } = entry.item;
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

export function PileSearch({
  value,
  onChange,
  count,
}: {
  value: string;
  onChange: (next: string) => void;
  count: number;
}) {
  const chips = useMemo(() => parseTradeSearchShortcuts(value).chips, [value]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Search ${count.toLocaleString()} objekts — e.g. sy cc101, lynn, aa`}
          className="pl-9 pr-9"
        />
        {value && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="-translate-y-1/2 absolute top-1/2 right-1 h-7 w-7"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              title={chip.hint}
              className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary text-xs"
            >
              {chip.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
