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

/** Converts a resolved poster item into the shape the /api/posters POST/PATCH body expects. */
export function resolvedItemToApiInput(
  item: ResolvedPosterItem,
  position: number,
) {
  return {
    collectionId: item.entry?.collectionId ?? null,
    collectionNo: item.entry?.collectionNo ?? item.parsed.collectionNo ?? null,
    member: item.entry?.member ?? item.parsed.member ?? null,
    season: item.entry?.season ?? item.parsed.season ?? null,
    class: item.entry?.class ?? null,
    thumbnailUrl: item.imageUrl ?? null,
    serial: item.parsed.serial ? parseInt(item.parsed.serial, 10) : null,
    objektId:
      (item.entry as ObjektEntry & { objektId?: string })?.objektId ?? null,
    quantity: item.parsed.quantity ?? 1,
    freeform: item.parsed.freeform ?? false,
    rawLabel: item.parsed.raw ?? null,
    onOffline: item.parsed.onOffline ?? null,
    position,
  };
}
