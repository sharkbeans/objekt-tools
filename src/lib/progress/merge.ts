import { normalizeArtistId } from "@/lib/artist-utils";
import type { ProgressRollup } from "./types";

type TotalsRow = {
  artist: string;
  member: string;
  class: string;
  season: string;
  onOffline: string;
  total: number;
};
type OwnedRow = {
  artist: string;
  member: string;
  class: string;
  season: string;
  onOffline: string;
  owned: number;
};

export function mergeProgressRollups(
  totals: TotalsRow[],
  owned: OwnedRow[],
): ProgressRollup[] {
  const map = new Map<string, ProgressRollup>();

  for (const row of totals) {
    const artist = normalizeArtistId(row.artist);
    const key = `${artist}|${row.member}|${row.class}|${row.season}|${row.onOffline}`;
    map.set(key, {
      artist,
      member: row.member,
      class: row.class,
      season: row.season,
      onOffline: row.onOffline,
      owned: 0,
      total: row.total,
    });
  }

  for (const row of owned) {
    const artist = normalizeArtistId(row.artist);
    const key = `${artist}|${row.member}|${row.class}|${row.season}|${row.onOffline}`;
    const existing = map.get(key);
    if (existing) {
      existing.owned = row.owned;
    } else {
      map.set(key, {
        artist,
        member: row.member,
        class: row.class,
        season: row.season,
        onOffline: row.onOffline,
        owned: row.owned,
        total: 0,
      });
    }
  }

  return Array.from(map.values());
}
