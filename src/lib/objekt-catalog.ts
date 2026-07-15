import { indexer } from "@/lib/db/indexer";
import { collections } from "@/lib/db/indexer-schema";
import { getCached } from "@/lib/server-cache";

export type CatalogRow = {
  collectionId: string;
  artist: string;
  member: string;
  collectionNo: string;
  season: string;
  class: string;
  frontImage: string;
  thumbnailImage: string;
};

/**
 * The full trimmed objekt catalog (~15k rows), cached in-process for 30
 * minutes. Backs both the client-facing /api/objekts/catalog route (for
 * client-side filtering with the search grammar) and the legacy
 * /api/objekts/search collectionId lookup route.
 */
export function getObjektCatalog(): Promise<CatalogRow[]> {
  return getCached("objekts:catalog:v1", 30 * 60_000, () =>
    indexer
      .select({
        collectionId: collections.collectionId,
        artist: collections.artist,
        member: collections.member,
        collectionNo: collections.collectionNo,
        season: collections.season,
        class: collections.class,
        frontImage: collections.frontImage,
        thumbnailImage: collections.thumbnailImage,
      })
      .from(collections),
  );
}
