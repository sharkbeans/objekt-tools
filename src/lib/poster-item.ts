import type { ObjektEntry } from "@/lib/cosmo/types";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";
import { getSeasonPrefix, stripVariantSuffix } from "@/lib/season-prefix";

/** Build a poster have/want item from an already-resolved objekt entry. */
export function makePosterItem(entry: ObjektEntry): ResolvedPosterItem {
  const imageUrl =
    (entry as ObjektEntry & { frontImage?: string }).thumbnailImage ??
    (entry as ObjektEntry & { frontImage?: string }).frontImage ??
    null;
  return {
    parsed: {
      member: entry.member,
      season: entry.season,
      collectionNo: stripVariantSuffix(entry.collectionNo),
      raw: `${entry.member} ${getSeasonPrefix(entry.season)}${stripVariantSuffix(entry.collectionNo)}`,
      ...(entry.serial != null ? { serial: String(entry.serial) } : {}),
    },
    entry,
    imageUrl,
  };
}
