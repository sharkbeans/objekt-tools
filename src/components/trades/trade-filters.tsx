"use client";

import { useQueryStates, parseAsArrayOf, parseAsString } from "nuqs";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import {
  ARTISTS,
  MEMBERS_BY_ARTIST,
  SEASONS,
  CLASSES,
  ON_OFFLINE_OPTIONS,
  type Artist,
} from "@/lib/filters";

const artistOptions = ARTISTS.map((a) => ({
  value: a,
  label: a.charAt(0).toUpperCase() + a.slice(1),
}));

const seasonOptions = SEASONS.map((s) => ({ value: s, label: s }));
const classOptions = CLASSES.map((c) => ({ value: c, label: c }));

export const filterParsers = {
  artist: parseAsArrayOf(parseAsString).withDefault([]),
  member: parseAsArrayOf(parseAsString).withDefault([]),
  season: parseAsArrayOf(parseAsString).withDefault([]),
  class: parseAsArrayOf(parseAsString).withDefault([]),
  onOffline: parseAsString.withDefault(""),
  sort: parseAsString.withDefault("newest"),
};

export function TradeFilters() {
  const [filters, setFilters] = useQueryStates(filterParsers, {
    shallow: false,
  });

  const memberOptions = filters.artist.length > 0
    ? filters.artist.flatMap((a) =>
        (MEMBERS_BY_ARTIST[a as Artist] ?? []).map((m) => ({
          value: m,
          label: m,
        }))
      )
    : Object.values(MEMBERS_BY_ARTIST)
        .flat()
        .map((m) => ({ value: m, label: m }));

  const hasFilters =
    filters.artist.length > 0 ||
    filters.member.length > 0 ||
    filters.season.length > 0 ||
    filters.class.length > 0 ||
    filters.onOffline !== "" ||
    filters.sort !== "newest";

  const clearAll = () => {
    setFilters({
      artist: [],
      member: [],
      season: [],
      class: [],
      onOffline: "",
      sort: "newest",
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelect
        options={artistOptions}
        selected={filters.artist}
        onChange={(v) => {
          setFilters({ artist: v, member: [] });
        }}
        placeholder="Artist"
      />
      <MultiSelect
        options={memberOptions}
        selected={filters.member}
        onChange={(v) => setFilters({ member: v })}
        placeholder="Member"
      />
      <MultiSelect
        options={seasonOptions}
        selected={filters.season}
        onChange={(v) => setFilters({ season: v })}
        placeholder="Season"
      />
      <MultiSelect
        options={classOptions}
        selected={filters.class}
        onChange={(v) => setFilters({ class: v })}
        placeholder="Class"
      />
      <Select
        value={filters.onOffline || "all"}
        onValueChange={(v) => setFilters({ onOffline: v === "all" ? "" : v })}
      >
        <SelectTrigger size="sm" className="h-8 border-dashed">
          <SelectValue placeholder="On/Offline" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="online">Online</SelectItem>
          <SelectItem value="offline">Offline</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.sort}
        onValueChange={(v) => setFilters({ sort: v })}
      >
        <SelectTrigger size="sm" className="h-8">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="oldest">Oldest</SelectItem>
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={clearAll}
        >
          <XIcon className="size-3" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
