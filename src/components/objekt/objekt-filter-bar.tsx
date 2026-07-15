"use client";

import { SearchIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  ClassMultiSelect,
  SeasonMultiSelect,
} from "@/components/ui/class-multi-select";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { useFilterOptions } from "@/hooks/use-filter-options";
import { validOnlineTypes } from "@/lib/filters";
import { applyArtistSelection } from "@/lib/objekt-filters/mutations";
import {
  defaultFilters,
  type ObjektFilterState,
} from "@/lib/objekt-filters/types";
import { ObjektFilterChips } from "./objekt-filter-chips";

export type { ObjektFilterState };
export { defaultFilters };

interface ObjektFilterBarProps {
  filters: ObjektFilterState;
  onChange: (filters: ObjektFilterState) => void;
  showSearch?: boolean;
  showSort?: boolean;
  showFilterMode?: boolean;
  showMember?: boolean;
  searchPlaceholder?: string;
  /** Extra controls (e.g. Cancel/Confirm) rendered at the end of the dropdown row. */
  actions?: ReactNode;
}

export function ObjektFilterBar({
  filters,
  onChange,
  showSearch = true,
  showSort = true,
  showFilterMode = true,
  showMember = true,
  searchPlaceholder = "Quick Search: jw a201z, sy divine, !dco #1-100…",
  actions,
}: ObjektFilterBarProps) {
  const filterOptions = useFilterOptions();

  function update(partial: Partial<ObjektFilterState>) {
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
    onChange(applyArtistSelection(filters, artists, filterOptions));
  }

  return (
    <div className="space-y-3">
      {/* Quick Search */}
      {showSearch && (
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8"
            placeholder={searchPlaceholder}
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
        {/* Top row: Have/Want toggle + Sort */}
        {(showFilterMode || showSort) && (
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
          </div>
        )}

        {/* Filter dropdowns: 2-col grid on mobile, inline on desktop */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2 items-center">
          <MultiSelect
            options={filterOptions.artists}
            value={filters.artist}
            onChange={handleArtistChange}
            placeholder="Artist"
            className="w-full sm:w-auto sm:min-w-28"
          />

          {showMember && (
            <MultiSelect
              options={availableMembers.map((m) => ({ label: m, value: m }))}
              value={filters.member}
              onChange={(v) => update({ member: v })}
              placeholder="Member"
              className="w-full sm:w-auto sm:min-w-32"
            />
          )}

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

          {actions && (
            <div className="flex items-center gap-2 ml-auto shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>

      <ObjektFilterChips
        filters={filters}
        onChange={onChange}
        filterOptions={filterOptions}
      />
    </div>
  );
}
