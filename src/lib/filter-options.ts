import { artistLabel, normalizeArtistId } from "@/lib/artist-utils";
import {
  classArtistMap,
  membersByArtist,
  seasonArtistMap,
  validArtists,
} from "@/lib/filters";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterOptionColumn {
  artistId: string;
  label: string;
  items: string[];
}

export interface FilterOptions {
  artists: FilterOption[];
  membersByArtist: Record<string, string[]>;
  seasonsByArtist: Record<string, string[]>;
  classesByArtist: Record<string, string[]>;
  allMembers: string[];
  allSeasons: string[];
  allClasses: string[];
  seasonColumns: FilterOptionColumn[];
  classColumns: FilterOptionColumn[];
}

const seasonOrder = [
  "Atom",
  "Binary",
  "Cream",
  "Divine",
  "Ever",
  "Spring",
  "Summer",
  "Autumn",
  "Winter",
];

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function parseSeason(season: string) {
  const match = season.match(/^([A-Za-z]+?)(\d+)$/);
  if (!match) return { rank: 999, cycle: 999, name: season };
  const [, name, number] = match;
  const rank = seasonOrder.indexOf(name);
  return {
    name,
    rank: rank === -1 ? 500 : rank,
    cycle: Number.parseInt(number, 10),
  };
}

export function compareSeasons(a: string, b: string) {
  const left = parseSeason(a);
  const right = parseSeason(b);
  if (left.cycle !== right.cycle) return left.cycle - right.cycle;
  if (left.rank !== right.rank) return left.rank - right.rank;
  return a.localeCompare(b);
}

export const fallbackFilterOptions: FilterOptions = (() => {
  const artists = validArtists.map((artist) => ({
    label: artistLabel(artist),
    value: artist,
  }));

  const fallbackMembersByArtist = Object.fromEntries(
    Object.entries(membersByArtist).map(([artist, members]) => [
      artist,
      uniqueSorted(members),
    ]),
  );
  const fallbackSeasonsByArtist = Object.fromEntries(
    seasonArtistMap.map((entry) => [
      entry.artistId,
      [...entry.seasons].sort(compareSeasons),
    ]),
  );
  const fallbackClassesByArtist = Object.fromEntries(
    classArtistMap.map((entry) => [
      entry.artistId,
      uniqueSorted(entry.classes),
    ]),
  );

  return buildFilterOptions({
    artists: artists.map((artist) => artist.value),
    membersByArtist: fallbackMembersByArtist,
    seasonsByArtist: fallbackSeasonsByArtist,
    classesByArtist: fallbackClassesByArtist,
  });
})();

export function buildFilterOptions(input: {
  artists: string[];
  membersByArtist: Record<string, string[]>;
  seasonsByArtist: Record<string, string[]>;
  classesByArtist: Record<string, string[]>;
}): FilterOptions {
  const artistValues = uniqueSorted(input.artists.map(normalizeArtistId));

  const normalizeRecord = (
    record: Record<string, string[]>,
    seasonSort = false,
  ) => {
    const out: Record<string, string[]> = {};
    for (const [artist, values] of Object.entries(record)) {
      const key = normalizeArtistId(artist);
      const merged = [...(out[key] ?? []), ...values];
      out[key] = seasonSort
        ? [...new Set(merged)].sort(compareSeasons)
        : uniqueSorted(merged);
    }
    return out;
  };

  const normalizedMembers = normalizeRecord(input.membersByArtist);
  const normalizedSeasons = normalizeRecord(input.seasonsByArtist, true);
  const normalizedClasses = normalizeRecord(input.classesByArtist);

  const artists = artistValues.map((artist) => ({
    label: artistLabel(artist),
    value: artist,
  }));

  const allMembers = uniqueSorted(Object.values(normalizedMembers).flat());
  const allSeasons = [...new Set(Object.values(normalizedSeasons).flat())].sort(
    compareSeasons,
  );
  const allClasses = uniqueSorted(Object.values(normalizedClasses).flat());

  const seasonColumns = artists.map((artist) => ({
    artistId: artist.value,
    label: artist.label,
    items: normalizedSeasons[artist.value] ?? [],
  }));
  const classColumns = artists.map((artist) => ({
    artistId: artist.value,
    label: artist.label,
    items: normalizedClasses[artist.value] ?? [],
  }));

  return {
    artists,
    membersByArtist: normalizedMembers,
    seasonsByArtist: normalizedSeasons,
    classesByArtist: normalizedClasses,
    allMembers,
    allSeasons,
    allClasses,
    seasonColumns,
    classColumns,
  };
}
