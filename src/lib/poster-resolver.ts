import type { ObjektEntry } from "@/lib/cosmo/types";
import { fetchObjektCatalog } from "@/lib/objekt-catalog-client";
import type { ParsedItem } from "@/lib/paste-parser";

export interface ResolvedPosterItem {
  parsed: ParsedItem;
  entry: ObjektEntry | null;
  imageUrl: string | null;
  error?: string;
}

/**
 * Resolve parsed items against the objekt catalog to get thumbnail images.
 * Works for both haves and wants — no ownership validation needed for poster.
 */
export async function resolveForPoster(
  items: ParsedItem[],
): Promise<ResolvedPosterItem[]> {
  if (items.length === 0) return [];

  const catalog = await fetchObjektCatalog();

  return items.map((item) => {
    if (item.freeform) {
      return { parsed: item, entry: null, imageUrl: null };
    }

    // Filter to exact collectionNo match (season + digits, ignoring the a/z
    // online/offline suffix); if onOffline was specified, require that variant.
    const matches = catalog.filter((row) => {
      if (row.season !== item.season) return false;
      const suffix = row.collectionNo.slice(-1).toLowerCase();
      const digits = /[az]/.test(suffix)
        ? row.collectionNo.slice(0, -1)
        : row.collectionNo;
      if (digits !== item.collectionNo) return false;
      if (item.onOffline) {
        const rowOnOffline =
          suffix === "a" ? "online" : suffix === "z" ? "offline" : null;
        return rowOnOffline === item.onOffline;
      }
      return true;
    });

    if (matches.length === 0) {
      return {
        parsed: item,
        entry: null,
        imageUrl: null,
        error: `Not found: ${item.raw}`,
      };
    }

    // If member specified, find exact match
    const match = item.member
      ? matches.find((m) => m.member === item.member)
      : matches[0];

    if (!match) {
      return {
        parsed: item,
        entry: null,
        imageUrl: null,
        error: `Not found: ${item.raw}`,
      };
    }

    const imageUrl = match.thumbnailImage ?? match.frontImage ?? null;
    return { parsed: item, entry: match, imageUrl };
  });
}
