import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { indexer } from "@/lib/db/indexer";
import { mirror } from "@/lib/db/indexer-mirror";
import { collections, objekts } from "@/lib/db/indexer-schema";

type CollectionMetadata = {
  id: string;
  collectionId: string;
  artist: string;
  member: string;
  collectionNo: string;
  season: string;
  class: string;
  thumbnailImage: string;
  frontImage: string;
  backImage: string;
  accentColor: string;
  onOffline: "online" | "offline";
};

export type InventoryRow = {
  collectionId: string;
  artist: string;
  member: string;
  collectionNo: string;
  season: string;
  class: string;
  thumbnailImage: string;
  serial: number;
  objektId: string;
};

export type OwnedObjektRow = {
  collectionDbId: string | null;
  collectionId: string;
  serial: number;
  transferable: boolean;
  objektId: string;
};

export async function loadCollectionMetadataByDbIds(
  collectionDbIds: string[],
): Promise<Map<string, CollectionMetadata>> {
  const uniqueIds = uniqueStrings(collectionDbIds);

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const rows = await mirror
    .select({
      id: collections.id,
      collectionId: collections.collectionId,
      artist: collections.artist,
      member: collections.member,
      collectionNo: collections.collectionNo,
      season: collections.season,
      class: collections.class,
      thumbnailImage: collections.thumbnailImage,
      frontImage: collections.frontImage,
      backImage: collections.backImage,
      accentColor: collections.accentColor,
      onOffline: collections.onOffline,
    })
    .from(collections)
    .where(inArray(collections.id, uniqueIds));

  const metadataById = new Map(rows.map((row) => [row.id, row]));
  const missingIds = uniqueIds.filter((id) => !metadataById.has(id));

  if (missingIds.length > 0) {
    const fallbackRows = await indexer
      .select({
        id: collections.id,
        collectionId: collections.collectionId,
        artist: collections.artist,
        member: collections.member,
        collectionNo: collections.collectionNo,
        season: collections.season,
        class: collections.class,
        thumbnailImage: collections.thumbnailImage,
        frontImage: collections.frontImage,
        backImage: collections.backImage,
        accentColor: collections.accentColor,
        onOffline: collections.onOffline,
      })
      .from(collections)
      .where(inArray(collections.id, missingIds));

    for (const row of fallbackRows) {
      metadataById.set(row.id, row);
    }
  }

  return metadataById;
}

export async function resolveCollectionDbIdsByPublicIds(
  collectionIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = uniqueStrings(collectionIds);

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const rows = await mirror
    .select({
      id: collections.id,
      collectionId: collections.collectionId,
    })
    .from(collections)
    .where(inArray(collections.collectionId, uniqueIds));

  const collectionDbIdByPublicId = new Map(
    rows.map((row) => [row.collectionId, row.id]),
  );
  const missingCollectionIds = uniqueIds.filter(
    (collectionId) => !collectionDbIdByPublicId.has(collectionId),
  );

  if (missingCollectionIds.length > 0) {
    const fallbackRows = await indexer
      .select({
        id: collections.id,
        collectionId: collections.collectionId,
      })
      .from(collections)
      .where(inArray(collections.collectionId, missingCollectionIds));

    for (const row of fallbackRows) {
      collectionDbIdByPublicId.set(row.collectionId, row.id);
    }
  }

  return collectionDbIdByPublicId;
}

export async function loadTransferableInventoryRows(
  address: string,
): Promise<InventoryRow[]> {
  const ownedRows = await indexer
    .select({
      collectionDbId: objekts.collectionId,
      serial: objekts.serial,
      objektId: objekts.id,
    })
    .from(objekts)
    .where(and(eq(objekts.owner, address), eq(objekts.transferable, true)));

  const collectionById = await loadCollectionMetadataByDbIds(
    uniqueCollectionDbIds(ownedRows.map((row) => row.collectionDbId)),
  );

  return ownedRows
    .flatMap((row) => {
      if (!row.collectionDbId) return [];
      const collection = collectionById.get(row.collectionDbId);
      if (!collection) return [];
      return [
        {
          collectionId: collection.collectionId,
          artist: collection.artist,
          member: collection.member,
          collectionNo: collection.collectionNo,
          season: collection.season,
          class: collection.class,
          thumbnailImage: collection.thumbnailImage,
          serial: row.serial,
          objektId: row.objektId,
        },
      ];
    })
    .sort(compareInventoryRows)
    .slice(0, 500);
}

export async function loadOwnedCollectionCountsByDbId(address: string) {
  return indexer
    .select({
      collectionDbId: objekts.collectionId,
      ownedCount: count(),
      transferableCount:
        sql<number>`count(*) filter (where ${objekts.transferable})`.mapWith(
          Number,
        ),
    })
    .from(objekts)
    .where(eq(objekts.owner, address))
    .groupBy(objekts.collectionId);
}

export async function loadOwnedDistinctCollectionDbIds(address: string) {
  const rows = await indexer
    .selectDistinct({
      collectionDbId: objekts.collectionId,
    })
    .from(objekts)
    .where(eq(objekts.owner, address));

  return uniqueCollectionDbIds(rows.map((row) => row.collectionDbId));
}

export async function loadOwnedObjektsForPublicCollectionIds(
  address: string,
  collectionIds: string[],
): Promise<OwnedObjektRow[]> {
  const collectionDbIdByPublicId =
    await resolveCollectionDbIdsByPublicIds(collectionIds);
  const publicIdByCollectionDbId = new Map(
    [...collectionDbIdByPublicId.entries()].map(([collectionId, id]) => [
      id,
      collectionId,
    ]),
  );
  const collectionDbIds = [...publicIdByCollectionDbId.keys()];

  if (collectionDbIds.length === 0) {
    return [];
  }

  const rows = await indexer
    .select({
      collectionDbId: objekts.collectionId,
      serial: objekts.serial,
      transferable: objekts.transferable,
      objektId: objekts.id,
    })
    .from(objekts)
    .where(
      and(
        eq(objekts.owner, address),
        inArray(objekts.collectionId, collectionDbIds),
      ),
    )
    .orderBy(asc(objekts.serial));

  return rows.flatMap((row) => {
    if (!row.collectionDbId) return [];
    const collectionId = publicIdByCollectionDbId.get(row.collectionDbId);
    if (!collectionId) return [];
    return [{ ...row, collectionId }];
  });
}

function compareInventoryRows(a: InventoryRow, b: InventoryRow) {
  const memberCompare = a.member.localeCompare(b.member);
  if (memberCompare !== 0) return memberCompare;

  const collectionNoCompare = a.collectionNo.localeCompare(
    b.collectionNo,
    undefined,
    { numeric: true },
  );
  if (collectionNoCompare !== 0) return collectionNoCompare;

  return a.serial - b.serial;
}

function uniqueCollectionDbIds(
  collectionDbIds: Array<string | null>,
): string[] {
  return [...new Set(collectionDbIds.filter((id): id is string => !!id))];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
