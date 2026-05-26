"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClassMultiSelect,
  decodeGroupedValue,
  SeasonMultiSelect,
} from "@/components/ui/class-multi-select";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { useFilterOptions } from "@/hooks/use-filter-options";
import { artistLabel } from "@/lib/artist-utils";
import { validOnlineTypes } from "@/lib/filters";

export type TradeFilterState = {
  search: string;
  artist: string[];
  member: string[];
  season: string[];
  class: string[];
  on_offline: string[];
  sort: string;
  filterMode: "haves" | "wants";
};

export const defaultFilters: TradeFilterState = {
  search: "",
  artist: [],
  member: [],
  season: [],
  class: [],
  on_offline: [],
  sort: "newest",
  filterMode: "haves",
};

interface TradeFiltersProps {
  filters: TradeFilterState;
  onChange: (filters: TradeFilterState) => void;
  showSearch?: boolean;
  showSort?: boolean;
  showFilterMode?: boolean;
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

export function TradeFilters({
  filters,
  onChange,
  showSearch = true,
  showSort = true,
  showFilterMode = true,
}: TradeFiltersProps) {
  const filterOptions = useFilterOptions();

  function update(partial: Partial<TradeFilterState>) {
    onChange({ ...filters, ...partial });
  }

  const availableSeasons = filters.artist.length
    ? filters.artist.flatMap(
        (artist) => filterOptions.seasonsByArtist[artist] ?? [],
      )
    : filterOptions.allSeasons;
  const availableClasses = filters.artist.length
    ? filters.artist.flatMap(
        (artist) => filterOptions.classesByArtist[artist] ?? [],
      )
    : filterOptions.allClasses;
  const availableMembers = filters.artist.length
    ? filters.artist.flatMap(
        (artist) => filterOptions.membersByArtist[artist] ?? [],
      )
    : filterOptions.allMembers;

  // When artist changes, drop any member/season/class values that are no longer valid
  function handleArtistChange(artists: string[]) {
    const newSeasons = artists.length
      ? artists.flatMap((artist) => filterOptions.seasonsByArtist[artist] ?? [])
      : filterOptions.allSeasons;
    const newClasses = artists.length
      ? artists.flatMap((artist) => filterOptions.classesByArtist[artist] ?? [])
      : filterOptions.allClasses;
    const newMembers = artists.length
      ? artists.flatMap((artist) => filterOptions.membersByArtist[artist] ?? [])
      : filterOptions.allMembers;
    update({
      artist: artists,
      // season/class are scoped "artistId::value" — keep only those whose item is still valid
      season: filters.season.filter((s) => {
        const decoded = decodeGroupedValue(s);
        return decoded
          ? newSeasons.includes(decoded.item)
          : newSeasons.includes(s);
      }),
      class: filters.class.filter((c) => {
        const decoded = decodeGroupedValue(c);
        return decoded
          ? newClasses.includes(decoded.item)
          : newClasses.includes(c);
      }),
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
      <div className="space-y-2">
        {/* Top row: Have/Want toggle + Sort + Reset */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Have/Want toggle */}
          {showFilterMode && (
            <div className="flex gap-0.5 rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => update({ filterMode: "haves" })}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${filters.filterMode === "haves" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Haves
              </button>
              <button
                type="button"
                onClick={() => update({ filterMode: "wants" })}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${filters.filterMode === "wants" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Wants
              </button>
            </div>
          )}

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
              className={`h-9 text-xs text-muted-foreground${showSort ? "" : " ml-auto"}`}
            >
              <XIcon className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
          )}
        </div>

        {/* Filter dropdowns: 2-col grid on mobile, inline on desktop */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
          <MultiSelect
            options={filterOptions.artists}
            value={filters.artist}
            onChange={handleArtistChange}
            placeholder="Artist"
            className="w-full sm:w-auto sm:min-w-28"
          />

          <MultiSelect
            options={availableMembers.map((m) => ({ label: m, value: m }))}
            value={filters.member}
            onChange={(v) => update({ member: v })}
            placeholder="Member"
            className="w-full sm:w-auto sm:min-w-32"
          />

          <SeasonMultiSelect
            options={availableSeasons}
            columns={filterOptions.seasonColumns}
            value={filters.season}
            onChange={(v) => update({ season: v })}
            placeholder="Season"
            className="w-full sm:w-auto sm:min-w-32"
          />

          <ClassMultiSelect
            options={availableClasses}
            columns={filterOptions.classColumns}
            value={filters.class}
            onChange={(v) => update({ class: v })}
            placeholder="Class"
            className="w-full sm:w-auto sm:min-w-28"
          />

          <MultiSelect
            options={validOnlineTypes.map((t) => ({
              label: t === "online" ? "Digital" : "Physical",
              value: t,
            }))}
            value={filters.on_offline}
            onChange={(v) => update({ on_offline: v })}
            placeholder="Type"
            className="w-full sm:w-auto sm:min-w-24"
          />
        </div>
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
                onClick={() =>
                  handleArtistChange(filters.artist.filter((x) => x !== a))
                }
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
                onClick={() =>
                  update({ member: filters.member.filter((x) => x !== m) })
                }
              >
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.season.map((s) => {
            const decoded = decodeGroupedValue(s);
            const label = decoded
              ? `${artistLabel(decoded.artistId)} ${decoded.item}`
              : s;
            return (
              <Badge key={s} variant="secondary" className="gap-1 text-xs">
                {label}
                <button
                  type="button"
                  onClick={() =>
                    update({ season: filters.season.filter((x) => x !== s) })
                  }
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          {filters.class.map((c) => {
            const decoded = decodeGroupedValue(c);
            const label = decoded
              ? `${artistLabel(decoded.artistId)} ${decoded.item}`
              : c;
            return (
              <Badge key={c} variant="secondary" className="gap-1 text-xs">
                {label}
                <button
                  type="button"
                  onClick={() =>
                    update({ class: filters.class.filter((x) => x !== c) })
                  }
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          {filters.on_offline.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 text-xs">
              {t === "online" ? "Digital" : "Physical"}
              <button
                type="button"
                onClick={() =>
                  update({
                    on_offline: filters.on_offline.filter((x) => x !== t),
                  })
                }
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
