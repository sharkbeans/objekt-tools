"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  validArtists,
  validClasses,
  validOnlineTypes,
  validSeasons,
  classArtistMap,
  seasonArtistMap,
  membersByArtist,
  type ValidArtist,
} from "@/lib/filters";

export type TradeFilterState = {
  search: string;
  artist: string[];
  member: string[];
  season: string[];
  class: string[];
  on_offline: string[];
  sort: string;
};

export const defaultFilters: TradeFilterState = {
  search: "",
  artist: [],
  member: [],
  season: [],
  class: [],
  on_offline: [],
  sort: "newest",
};

interface TradeFiltersProps {
  filters: TradeFilterState;
  onChange: (filters: TradeFilterState) => void;
  showSearch?: boolean;
  showSort?: boolean;
}

function getAvailableSeasons(selectedArtists: string[]): string[] {
  if (!selectedArtists.length) return [...validSeasons];
  const seasons = new Set<string>();
  for (const a of selectedArtists) {
    const map = seasonArtistMap.find((m) => m.artistId === a);
    for (const s of map?.seasons ?? []) seasons.add(s);
  }
  return [...validSeasons].filter((s) => seasons.has(s));
}

function getAvailableClasses(selectedArtists: string[]): string[] {
  if (!selectedArtists.length) return [...validClasses];
  const classes = new Set<string>();
  for (const a of selectedArtists) {
    const map = classArtistMap.find((m) => m.artistId === a);
    for (const c of map?.classes ?? []) classes.add(c);
  }
  return [...validClasses].filter((c) => classes.has(c));
}

function getAvailableMembers(selectedArtists: string[]): string[] {
  const source = selectedArtists.length
    ? selectedArtists.flatMap((a) => membersByArtist[a as ValidArtist] ?? [])
    : Object.values(membersByArtist).flat();
  return [...new Set(source)].sort();
}

function hasActiveFilters(filters: TradeFilterState): boolean {
  return (
    !!filters.search ||
    filters.artist.length > 0 ||
    filters.member.length > 0 ||
    filters.season.length > 0 ||
    filters.class.length > 0 ||
    filters.on_offline.length > 0
  );
}

export function TradeFilters({ filters, onChange, showSearch = true, showSort = true }: TradeFiltersProps) {
  function update(partial: Partial<TradeFilterState>) {
    onChange({ ...filters, ...partial });
  }

  const availableSeasons = getAvailableSeasons(filters.artist);
  const availableClasses = getAvailableClasses(filters.artist);
  const availableMembers = getAvailableMembers(filters.artist);

  // When artist changes, drop any member/season/class values that are no longer valid
  function handleArtistChange(artists: string[]) {
    const newSeasons = getAvailableSeasons(artists);
    const newClasses = getAvailableClasses(artists);
    const newMembers = getAvailableMembers(artists);
    update({
      artist: artists,
      season: filters.season.filter((s) => newSeasons.includes(s)),
      class: filters.class.filter((c) => newClasses.includes(c)),
      member: filters.member.filter((m) => newMembers.includes(m)),
    });
  }

  const active = hasActiveFilters(filters);

  return (
    <div className="space-y-3">
      {/* Quick Search */}
      {showSearch && (
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8"
            placeholder="Quick Search: jw a201z, sy divine, !dco #1-100…"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => update({ search: "" })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <MultiSelect
          options={validArtists.map((a) => ({ label: a, value: a }))}
          value={filters.artist}
          onChange={handleArtistChange}
          placeholder="Artist"
          className="min-w-28"
        />

        <MultiSelect
          options={availableMembers.map((m) => ({ label: m, value: m }))}
          value={filters.member}
          onChange={(v) => update({ member: v })}
          placeholder="Member"
          className="min-w-32"
        />

        <MultiSelect
          options={availableSeasons.map((s) => ({ label: s, value: s }))}
          value={filters.season}
          onChange={(v) => update({ season: v })}
          placeholder="Season"
          className="min-w-32"
        />

        <MultiSelect
          options={availableClasses.map((c) => ({ label: c, value: c }))}
          value={filters.class}
          onChange={(v) => update({ class: v })}
          placeholder="Class"
          className="min-w-28"
        />

        <MultiSelect
          options={validOnlineTypes.map((t) => ({
            label: t === "online" ? "Digital" : "Physical",
            value: t,
          }))}
          value={filters.on_offline}
          onChange={(v) => update({ on_offline: v })}
          placeholder="Type"
          className="min-w-24"
        />

        {showSort && (
          <div className="flex gap-1 ml-auto">
            <Button
              variant={filters.sort === "newest" ? "default" : "outline"}
              size="sm"
              onClick={() => update({ sort: "newest" })}
              className="h-9 text-xs"
            >
              Newest
            </Button>
            <Button
              variant={filters.sort === "oldest" ? "default" : "outline"}
              size="sm"
              onClick={() => update({ sort: "oldest" })}
              className="h-9 text-xs"
            >
              Oldest
            </Button>
          </div>
        )}

        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(defaultFilters)}
            className="h-9 text-xs text-muted-foreground"
          >
            <XIcon className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {/* Active filter badges */}
      {active && (
        <div className="flex flex-wrap gap-1.5">
          {filters.search && (
            <Badge variant="secondary" className="gap-1 text-xs">
              &quot;{filters.search}&quot;
              <button type="button" onClick={() => update({ search: "" })}>
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.artist.map((a) => (
            <Badge key={a} variant="secondary" className="gap-1 text-xs">
              {a}
              <button
                type="button"
                onClick={() => handleArtistChange(filters.artist.filter((x) => x !== a))}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.member.map((m) => (
            <Badge key={m} variant="secondary" className="gap-1 text-xs">
              {m}
              <button
                type="button"
                onClick={() => update({ member: filters.member.filter((x) => x !== m) })}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.season.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1 text-xs">
              {s}
              <button
                type="button"
                onClick={() => update({ season: filters.season.filter((x) => x !== s) })}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.class.map((c) => (
            <Badge key={c} variant="secondary" className="gap-1 text-xs">
              {c}
              <button
                type="button"
                onClick={() => update({ class: filters.class.filter((x) => x !== c) })}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.on_offline.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 text-xs">
              {t === "online" ? "Digital" : "Physical"}
              <button
                type="button"
                onClick={() => update({ on_offline: filters.on_offline.filter((x) => x !== t) })}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
