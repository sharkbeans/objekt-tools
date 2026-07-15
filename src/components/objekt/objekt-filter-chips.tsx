"use client";

import { XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { artistLabel } from "@/lib/artist-utils";
import type { FilterOptions } from "@/lib/filter-options";
import {
  applyArtistSelection,
  decodeGroupedValue,
  defaultFilters,
  type ObjektFilterState,
} from "@/lib/objekt-filters";

interface ObjektFilterChipsProps {
  filters: ObjektFilterState;
  onChange: (filters: ObjektFilterState) => void;
  filterOptions: FilterOptions;
}

function activeCount(filters: ObjektFilterState): number {
  return (
    (filters.search ? 1 : 0) +
    filters.artist.length +
    filters.member.length +
    filters.season.length +
    filters.class.length +
    filters.on_offline.length
  );
}

/**
 * Active-filter chips with per-chip clear + a reset-all control showing
 * the active count. Shared by every surface that renders ObjektFilterBar
 * so filter state (including the URL-backed surfaces) stays in sync.
 */
export function ObjektFilterChips({
  filters,
  onChange,
  filterOptions,
}: ObjektFilterChipsProps) {
  const count = activeCount(filters);
  if (count === 0) return null;

  function update(partial: Partial<ObjektFilterState>) {
    onChange({ ...filters, ...partial });
  }

  function removeArtist(artist: string) {
    onChange(
      applyArtistSelection(
        filters,
        filters.artist.filter((a) => a !== artist),
        filterOptions,
      ),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
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
          <button type="button" onClick={() => removeArtist(a)}>
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
      <button
        type="button"
        onClick={() => onChange(defaultFilters)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <XIcon className="h-3.5 w-3.5" />
        Reset ({count})
      </button>
    </div>
  );
}
