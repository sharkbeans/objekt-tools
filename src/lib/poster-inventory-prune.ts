import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { resolveNickname } from "@/lib/cosmo/resolve-nickname";
import { db } from "@/lib/db";
import { mirror } from "@/lib/db/indexer-mirror";
import { collections, objekts } from "@/lib/db/indexer-schema";
import { poster, posterHave } from "@/lib/db/schema";
import { syncPosterTradePost } from "@/lib/poster-trade-sync";
import { redis } from "@/lib/redis";

type PosterRow = {
  id: string;
  cosmoId: string;
  haves: Array<{ id: number; collectionId: string }>;
};

export async function pruneStaleHaves() {
  const rows = await db.query.poster.findMany({
    where: isNotNull(poster.cosmoId),
    columns: { id: true, cosmoId: true },
    with: {
      haves: {
        columns: { id: true, collectionId: true, freeform: true },
      },
    },
  });

  const posters: PosterRow[] = rows
    .map((row) => ({
      id: row.id,
      cosmoId: row.cosmoId!,
      haves: row.haves
        .filter(
          (have): have is typeof have & { collectionId: string } =>
            !have.freeform && have.collectionId !== null,
        )
        .map((have) => ({ id: have.id, collectionId: have.collectionId })),
    }))
    .filter((row) => row.cosmoId.trim().length > 0 && row.haves.length > 0);

  const postersByNickname = new Map<string, PosterRow[]>();
  for (const posterRow of posters) {
    const key = posterRow.cosmoId.trim().toLowerCase();
    const existing = postersByNickname.get(key);
    if (existing) existing.push(posterRow);
    else postersByNickname.set(key, [posterRow]);
  }

  let posterCount = 0;
  let rowsDeleted = 0;
  let syncedPosters = 0;
  let skippedNicknames = 0;
  let skippedPosters = 0;
  const errors: string[] = [];

  for (const [nickname, groupedPosters] of postersByNickname) {
    let resolved: Awaited<ReturnType<typeof resolveNickname>>;
    try {
      resolved = await resolveNickname(nickname);
    } catch (error) {
      skippedNicknames += 1;
      skippedPosters += groupedPosters.length;
      console.warn("[prune-stale-haves] nickname resolution failed:", {
        nickname,
        error,
      });
      continue;
    }

    if (!resolved) {
      skippedNicknames += 1;
      skippedPosters += groupedPosters.length;
      continue;
    }

    const collectionIds = [
      ...new Set(
        groupedPosters.flatMap((row) =>
          row.haves.map((have) => have.collectionId),
        ),
      ),
    ];
    if (collectionIds.length === 0) continue;

    const ownedRows = await mirror
      .select({ collectionId: collections.collectionId })
      .from(objekts)
      .innerJoin(collections, eq(objekts.collectionId, collections.id))
      .where(
        and(
          eq(objekts.owner, resolved.address),
          inArray(collections.collectionId, collectionIds),
        ),
      );
    const ownedCollections = new Set(
      ownedRows
        .map((row) => row.collectionId)
        .filter((value): value is string => !!value),
    );

    for (const posterRow of groupedPosters) {
      const staleIds = posterRow.haves
        .filter((have) => !ownedCollections.has(have.collectionId))
        .map((have) => have.id);

      if (staleIds.length === 0) continue;

      await db.delete(posterHave).where(inArray(posterHave.id, staleIds));
      await redis.del(`poster:${posterRow.id}`);
      posterCount += 1;
      rowsDeleted += staleIds.length;

      try {
        await syncPosterTradePost(posterRow.id);
        syncedPosters += 1;
      } catch (error) {
        errors.push(`sync failed for poster ${posterRow.id}`);
        console.error("[prune-stale-haves] poster sync failed:", {
          posterId: posterRow.id,
          error,
        });
      }
    }
  }

  return {
    checkedNicknames: postersByNickname.size,
    checkedPosters: posters.length,
    prunedPosters: posterCount,
    deletedRows: rowsDeleted,
    syncedPosters,
    skippedNicknames,
    skippedPosters,
    errors,
  };
}
