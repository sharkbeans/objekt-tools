import { eq } from "drizzle-orm";
import { normalizeArtistId } from "@/lib/artist-utils";
import { mirror } from "@/lib/db/indexer-mirror";
import { collections } from "@/lib/db/indexer-schema";
import { compareSeasons } from "@/lib/filter-options";
import { membersByArtist } from "@/lib/filters";
import { isCollectionProgressCountable } from "@/lib/progress/countable";
import type {
  ProgressMemberCatalogInternalResponse,
  ProgressMemberCatalogResponse,
} from "@/lib/progress/types";
import { getCached } from "@/lib/server-cache";

function artistForMember(member: string): string {
  for (const [artist, members] of Object.entries(membersByArtist)) {
    if (members.includes(member)) return normalizeArtistId(artist);
  }
  return "";
}

export function isProgressMember(member: string): boolean {
  return Object.values(membersByArtist).some((members) =>
    members.includes(member),
  );
}

export function getProgressMemberCatalog(
  member: string,
): Promise<ProgressMemberCatalogInternalResponse> {
  return getCached(
    `progress:member-catalog:v1:${member.toLowerCase()}`,
    10 * 60_000,
    async () => {
      const rows = await mirror
        .select({
          id: collections.id,
          collectionId: collections.collectionId,
          collectionNo: collections.collectionNo,
          season: collections.season,
          class: collections.class,
          onOffline: collections.onOffline,
          thumbnailImage: collections.thumbnailImage,
          frontImage: collections.frontImage,
          backImage: collections.backImage,
          accentColor: collections.accentColor,
        })
        .from(collections)
        .where(eq(collections.member, member));

      type RawCollection = (typeof rows)[number];
      const azGroups = new Map<
        string,
        { a?: RawCollection; z?: RawCollection; other?: RawCollection }
      >();
      for (const collection of rows) {
        const noUpper = collection.collectionNo.toUpperCase();
        const base =
          noUpper.endsWith("A") || noUpper.endsWith("Z")
            ? `${collection.season}::${noUpper.slice(0, -1)}`
            : `${collection.season}::${noUpper}`;
        const entry = azGroups.get(base) ?? {};
        if (noUpper.endsWith("Z")) entry.z = collection;
        else if (noUpper.endsWith("A")) entry.a = collection;
        else entry.other = collection;
        azGroups.set(base, entry);
      }

      const artist = artistForMember(member);
      const result: ProgressMemberCatalogInternalResponse["collections"] = [];
      for (const entry of azGroups.values()) {
        const collection = entry.other ?? entry.z ?? entry.a;
        if (!collection) continue;
        result.push({
          collectionDbId: collection.id,
          collectionId: collection.collectionId,
          collectionNo: collection.collectionNo,
          season: collection.season,
          class: collection.class,
          onOffline: collection.onOffline,
          thumbnailImage: collection.thumbnailImage,
          frontImage: collection.frontImage,
          backImage: collection.backImage,
          accentColor: collection.accentColor,
          member,
          artist,
          baseProgressCountable: isCollectionProgressCountable(collection),
        });
      }

      result.sort((a, b) => {
        const seasonComparison = compareSeasons(a.season, b.season);
        if (seasonComparison !== 0) return seasonComparison;
        return a.collectionNo.localeCompare(b.collectionNo, undefined, {
          numeric: true,
        });
      });

      return { member, artist, collections: result };
    },
  );
}

export function toPublicProgressMemberCatalog(
  catalog: ProgressMemberCatalogInternalResponse,
): ProgressMemberCatalogResponse {
  return {
    member: catalog.member,
    artist: catalog.artist,
    collections: catalog.collections.map(
      ({ collectionDbId: _collectionDbId, ...collection }) => collection,
    ),
  };
}
