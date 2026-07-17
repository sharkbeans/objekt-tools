import type { PosterData } from "@/components/poster/poster-canvas";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";

// Hands off a poster draft from the grid board's "Trade" dialog
// (/collection/[nickname]/[member]) to the poster builder (/list?prefill=grid)
// via the URL fragment. With section subdomains enabled the two pages live on
// different origins (collect.<root> vs list.<root>), so sessionStorage can't
// carry the draft — the fragment travels with the navigation and never
// reaches the server.
export const GRID_TRADE_HASH_PARAM = "stash";

// Repeated identical items (one entry per offerable duplicate copy) are
// run-length collapsed so a large dupe stack doesn't blow up the URL.
type PackedItem = { item: ResolvedPosterItem; n: number };

type PackedStash = Omit<PosterData, "haves" | "wants"> & {
  haves: PackedItem[];
  wants: PackedItem[];
};

function pack(items: ResolvedPosterItem[]): PackedItem[] {
  const packed: PackedItem[] = [];
  let prevKey: string | null = null;
  for (const item of items) {
    const key = JSON.stringify(item);
    const last = packed[packed.length - 1];
    if (last && key === prevKey) last.n += 1;
    else {
      packed.push({ item, n: 1 });
      prevKey = key;
    }
  }
  return packed;
}

function unpack(packed: PackedItem[]): ResolvedPosterItem[] {
  return packed.flatMap(({ item, n }) =>
    Array.from({ length: Math.max(1, n) }, () => item),
  );
}

export function encodeGridTradeStash(posterData: PosterData): string {
  const payload: PackedStash = {
    ...posterData,
    haves: pack(posterData.haves),
    wants: pack(posterData.wants),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeGridTradeStash(encoded: string): PosterData | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as PackedStash;
    return {
      ...payload,
      haves: unpack(payload.haves),
      wants: unpack(payload.wants),
    };
  } catch {
    return null;
  }
}
