"use client";

import { XIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ClassMultiSelect,
  decodeGroupedValue,
  SeasonMultiSelect,
} from "@/components/ui/class-multi-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { useFilterOptions } from "@/hooks/use-filter-options";
import { anyWantLabel as computeAnyWantLabel } from "@/lib/objekt-label";

export type AnyWant = {
  isAny: true;
  artist?: string;
  member?: string;
  season?: string;
  class?: string;
};

export function anyWantLabel(w: AnyWant): string {
  return computeAnyWantLabel({ collectionId: "", ...w });
}

export function anyWantKey(w: AnyWant): string {
  return [w.artist, w.member, w.season, w.class].join("|");
}

/**
 * Filter-based want picker for objekts with no specific collection —
 * e.g. "Any HeeJin" or "Any Atom01". Matched at offer time by the Wants
 * Only gate (validateWantsOnly), not by proactive match notifications.
 */
export function AnyWantPicker({
  value,
  onChange,
}: {
  value: AnyWant[];
  onChange: (next: AnyWant[]) => void;
}) {
  const filterOptions = useFilterOptions();
  // Artist is only used to narrow the member/season/class dropdowns, never
  // stored as a want chip on its own.
  const [anyArtist, setAnyArtist] = useState<string[]>([]);

  const availableAnyMembers = anyArtist.length
    ? anyArtist.flatMap((artist) => filterOptions.membersByArtist[artist] ?? [])
    : filterOptions.allMembers;
  const availableAnySeasons = anyArtist.length
    ? anyArtist.flatMap((artist) => filterOptions.seasonsByArtist[artist] ?? [])
    : filterOptions.allSeasons;
  const availableAnyClasses = anyArtist.length
    ? anyArtist.flatMap((artist) => filterOptions.classesByArtist[artist] ?? [])
    : filterOptions.allClasses;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <MultiSelect
          options={filterOptions.artists}
          value={anyArtist}
          onChange={setAnyArtist}
          placeholder="Artist"
          className="min-w-28"
        />
        <MultiSelect
          options={availableAnyMembers.map((m) => ({ label: m, value: m }))}
          value={value.flatMap((w) => (w.member ? [w.member] : []))}
          onChange={(next) => {
            const prev = value.flatMap((w) => (w.member ? [w.member] : []));
            const added = next.filter((v) => !prev.includes(v));
            const removed = prev.filter((v) => !next.includes(v));
            const removedKeys = new Set(
              removed.map((m) => anyWantKey({ isAny: true, member: m })),
            );
            onChange([
              ...value.filter((w) => !removedKeys.has(anyWantKey(w))),
              ...added.map((m) => ({ isAny: true as const, member: m })),
            ]);
          }}
          placeholder="Member"
          className="min-w-32"
        />
        <SeasonMultiSelect
          options={availableAnySeasons}
          columns={filterOptions.seasonColumns}
          value={value.flatMap((w) => {
            if (!w.season) return [];
            return [w.artist ? `${w.artist}::${w.season}` : w.season];
          })}
          onChange={(next) => {
            const prev = value.flatMap((w) => {
              if (!w.season) return [];
              return [w.artist ? `${w.artist}::${w.season}` : w.season];
            });
            const added = next.filter((v) => !prev.includes(v));
            const removed = prev.filter((v) => !next.includes(v));
            const removedKeys = new Set(
              removed.map((s) => {
                const d = decodeGroupedValue(s);
                return anyWantKey({
                  isAny: true,
                  artist: d?.artistId,
                  season: d?.item ?? s,
                });
              }),
            );
            onChange([
              ...value.filter((w) => !removedKeys.has(anyWantKey(w))),
              ...added.map((s) => {
                const d = decodeGroupedValue(s);
                return {
                  isAny: true as const,
                  artist: d?.artistId,
                  season: d?.item ?? s,
                };
              }),
            ]);
          }}
          placeholder="Season"
          className="min-w-32"
        />
        <ClassMultiSelect
          options={availableAnyClasses}
          columns={filterOptions.classColumns}
          value={value.flatMap((w) => {
            if (!w.class) return [];
            return [w.artist ? `${w.artist}::${w.class}` : w.class];
          })}
          onChange={(next) => {
            const prev = value.flatMap((w) => {
              if (!w.class) return [];
              return [w.artist ? `${w.artist}::${w.class}` : w.class];
            });
            const added = next.filter((v) => !prev.includes(v));
            const removed = prev.filter((v) => !next.includes(v));
            const removedKeys = new Set(
              removed.map((c) => {
                const d = decodeGroupedValue(c);
                return anyWantKey({
                  isAny: true,
                  artist: d?.artistId,
                  class: d?.item ?? c,
                });
              }),
            );
            onChange([
              ...value.filter((w) => !removedKeys.has(anyWantKey(w))),
              ...added.map((c) => {
                const d = decodeGroupedValue(c);
                return {
                  isAny: true as const,
                  artist: d?.artistId,
                  class: d?.item ?? c,
                };
              }),
            ]);
          }}
          placeholder="Class"
          className="min-w-28"
        />
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((w, i) => (
            <Badge key={i} variant="secondary" className="gap-1 text-xs">
              {anyWantLabel(w)}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
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
