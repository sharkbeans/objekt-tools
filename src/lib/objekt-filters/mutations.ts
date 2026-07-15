import type { FilterOptions } from "@/lib/filter-options";
import { decodeGroupedValue } from "./grouped";
import type { ObjektFilterState } from "./types";

/**
 * Applies a new artist selection to filter state, pruning any member/
 * season/class values that are no longer valid for the selected artists.
 * Season/class values are scoped "artistId::value" — decoded before
 * checking validity. Shared by the filter bar's Artist dropdown and the
 * filter chips' artist-chip removal so both stay in sync.
 */
export function applyArtistSelection(
  filters: ObjektFilterState,
  artists: string[],
  filterOptions: FilterOptions,
): ObjektFilterState {
  const newSeasons = artists.length
    ? artists.flatMap((artist) => filterOptions.seasonsByArtist[artist] ?? [])
    : filterOptions.allSeasons;
  const newClasses = artists.length
    ? artists.flatMap((artist) => filterOptions.classesByArtist[artist] ?? [])
    : filterOptions.allClasses;
  const newMembers = artists.length
    ? artists.flatMap((artist) => filterOptions.membersByArtist[artist] ?? [])
    : filterOptions.allMembers;

  return {
    ...filters,
    artist: artists,
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
  };
}
