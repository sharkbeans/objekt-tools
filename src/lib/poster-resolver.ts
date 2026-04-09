import type { ParsedItem } from "@/lib/paste-parser";
import type { ObjektEntry } from "@/lib/cosmo/types";

export interface ResolvedPosterItem {
  parsed: ParsedItem;
  entry: ObjektEntry | null;
  imageUrl: string | null;
  error?: string;
}

async function searchObjekts(params: URLSearchParams): Promise<(ObjektEntry & { frontImage?: string })[]> {
  const res = await fetch(`/api/objekts/search?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

/**
 * Resolve parsed items against the search API to get thumbnail images.
 * Works for both haves and wants — no ownership validation needed for poster.
 */
export async function resolveForPoster(
  items: ParsedItem[],
): Promise<ResolvedPosterItem[]> {
  if (items.length === 0) return [];

  // Deduplicate by season|collectionNo|member
  const keyMap = new Map<string, ParsedItem[]>();
  for (const item of items) {
    const key = `${item.season}|${item.collectionNo}|${item.member ?? ""}`;
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key)!.push(item);
  }

  // Search in parallel
  const searchResults = new Map<string, (ObjektEntry & { frontImage?: string })[]>();
  await Promise.all(
    [...keyMap.entries()].map(async ([key, group]) => {
      const first = group[0];
      const params = new URLSearchParams();
      params.append("season", first.season);
      params.append("q", first.collectionNo);
      if (first.member) params.append("member", first.member);
      const results = await searchObjekts(params);
      searchResults.set(key, results);
    }),
  );

  // Map each original item to its resolved entry
  return items.map((item) => {
    const key = `${item.season}|${item.collectionNo}|${item.member ?? ""}`;
    const results = searchResults.get(key) ?? [];

    // Filter to exact collectionNo match (strip trailing a/z)
    const matches = results.filter((r) => {
      const digits = r.collectionNo.replace(/[azAZ]$/i, "");
      return digits === item.collectionNo;
    });

    if (matches.length === 0) {
      return { parsed: item, entry: null, imageUrl: null, error: `Not found: ${item.raw}` };
    }

    // If member specified, find exact match
    let match: (ObjektEntry & { frontImage?: string }) | undefined;
    if (item.member) {
      match = matches.find((m) => m.member === item.member);
    } else {
      match = matches[0];
    }

    if (!match) {
      return { parsed: item, entry: null, imageUrl: null, error: `Not found: ${item.raw}` };
    }

    const imageUrl = match.thumbnailImage ?? match.frontImage ?? null;
    return { parsed: item, entry: match, imageUrl };
  });
}
