import type { ObjektEntry } from "@/lib/cosmo/types";
import { anyWantLabel } from "@/lib/objekt-label";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";
import { getSeasonPrefix, stripVariantSuffix } from "@/lib/season-prefix";

/** Build a poster want item from an ANY-filter want (no specific objekt). */
export function makeAnyWantItem(want: {
  member?: string;
  season?: string;
  class?: string;
  artist?: string;
}): ResolvedPosterItem {
  return {
    parsed: {
      member: want.member ?? null,
      season: want.season ?? "",
      collectionNo: "",
      class: want.class ?? null,
      artist: want.artist ?? null,
      isAny: true,
      freeform: false,
      raw: anyWantLabel({ collectionId: "", ...want }),
    },
    entry: null,
    imageUrl: null,
  };
}

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
    class: item.entry?.class ?? item.parsed.class ?? null,
    thumbnailUrl: item.imageUrl ?? null,
    serial: item.parsed.serial ? parseInt(item.parsed.serial, 10) : null,
    objektId:
      (item.entry as ObjektEntry & { objektId?: string })?.objektId ?? null,
    quantity: item.parsed.quantity ?? 1,
    freeform: item.parsed.freeform ?? false,
    isAny: item.parsed.isAny ?? false,
    artist: item.entry?.artist ?? item.parsed.artist ?? null,
    rawLabel: item.parsed.raw ?? null,
    onOffline: item.parsed.onOffline ?? null,
    position,
  };
}
