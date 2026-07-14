import { and, asc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { indexer } from "@/lib/db/indexer";
import { collections, objekts } from "@/lib/db/indexer-schema";
import { tradePost, tradePostHave } from "@/lib/db/schema";
import { notify } from "@/lib/notify";

const TRADE_AVAILABILITY_STALE_MINUTES = Number(
  process.env.TRADE_AVAILABILITY_STALE_MINUTES ?? 30,
);
const TRADE_AVAILABILITY_BATCH_LIMIT = Number(
  process.env.TRADE_AVAILABILITY_BATCH_LIMIT ?? 40,
);

type LoadedTrade = {
  id: string;
  userId: string;
  haves: Array<{
    id: number;
    collectionId: string;
    collectionNo: string | null;
    member: string | null;
    serial: number | null;
  }>;
  user: {
    cosmoAccount: {
      address: string | null;
    } | null;
  };
};

type VerificationResult = {
  id: string;
  available: boolean;
  removed: number;
  remaining: number;
  deleted: boolean;
  unverifiable?: boolean;
};

function getStaleCutoff(now = new Date()) {
  return new Date(
    now.getTime() - TRADE_AVAILABILITY_STALE_MINUTES * 60 * 1000,
  );
}

function formatRemovedLabels(trade: LoadedTrade, removedIds: Set<number>) {
  return trade.haves
    .filter((have) => removedIds.has(have.id))
    .map((have) => {
      const name =
        have.member && have.collectionNo
          ? `${have.member} ${have.collectionNo}`
          : have.collectionId;
      return have.serial != null ? `${name} #${have.serial}` : name;
    })
    .join(", ");
}

function getOpenTradeWhere(userId?: string) {
  return userId
    ? and(eq(tradePost.status, "open"), eq(tradePost.userId, userId))
    : eq(tradePost.status, "open");
}

async function loadTradesForVerificationBatch(limit: number, userId?: string) {
  const unchecked = await db.query.tradePost.findMany({
    where: and(getOpenTradeWhere(userId), isNull(tradePost.availabilityCheckedAt)),
    orderBy: [asc(tradePost.updatedAt)],
    limit,
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      user: {
        columns: { id: true },
        with: { cosmoAccount: { columns: { address: true } } },
      },
    },
  });

  if (unchecked.length >= limit) return unchecked;

  const stale = await db.query.tradePost.findMany({
    where: and(
      getOpenTradeWhere(userId),
      isNotNull(tradePost.availabilityCheckedAt),
      lt(tradePost.availabilityCheckedAt, getStaleCutoff()),
    ),
    orderBy: [asc(tradePost.availabilityCheckedAt), asc(tradePost.updatedAt)],
    limit: limit - unchecked.length,
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      user: {
        columns: { id: true },
        with: { cosmoAccount: { columns: { address: true } } },
      },
    },
  });

  return [...unchecked, ...stale];
}

async function loadSingleOpenTradeForVerification(tradeId: string) {
  return db.query.tradePost.findFirst({
    where: and(eq(tradePost.id, tradeId), eq(tradePost.status, "open")),
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      user: {
        columns: { id: true },
        with: { cosmoAccount: { columns: { address: true } } },
      },
    },
  });
}

async function verifyLoadedTrades(
  trades: LoadedTrade[],
  now = new Date(),
): Promise<VerificationResult[]> {
  if (trades.length === 0) return [];

  const groupedByAddress = new Map<string, LoadedTrade[]>();
  const unverifiableIds: string[] = [];

  for (const trade of trades) {
    const address = trade.user.cosmoAccount?.address?.toLowerCase();
    if (!address) {
      unverifiableIds.push(trade.id);
      continue;
    }
    const existing = groupedByAddress.get(address);
    if (existing) existing.push(trade);
    else groupedByAddress.set(address, [trade]);
  }

  if (unverifiableIds.length > 0) {
    await db
      .update(tradePost)
      .set({ availabilityCheckedAt: now })
      .where(inArray(tradePost.id, unverifiableIds));
  }

  const results: VerificationResult[] = unverifiableIds.map((id) => ({
    id,
    available: true,
    removed: 0,
    remaining: 0,
    deleted: false,
    unverifiable: true,
  }));

  for (const [address, addressTrades] of groupedByAddress) {
    const collectionIds = [
      ...new Set(
        addressTrades.flatMap((trade) =>
          trade.haves.map((have) => have.collectionId),
        ),
      ),
    ];

    if (collectionIds.length === 0) {
      const ids = addressTrades.map((trade) => trade.id);
      await db
        .update(tradePost)
        .set({ availabilityCheckedAt: now })
        .where(inArray(tradePost.id, ids));
      results.push(
        ...addressTrades.map((trade) => ({
          id: trade.id,
          available: true,
          removed: 0,
          remaining: 0,
          deleted: false,
        })),
      );
      continue;
    }

    const ownedRows = await indexer
      .select({
        collectionId: collections.collectionId,
        serial: objekts.serial,
      })
      .from(objekts)
      .innerJoin(collections, eq(objekts.collectionId, collections.id))
      .where(
        and(
          eq(objekts.owner, address),
          inArray(collections.collectionId, collectionIds),
        ),
      );

    const ownedSet = new Set(
      ownedRows.map((row) => `${row.collectionId}:${row.serial}`),
    );
    const ownedCollections = new Set(
      ownedRows
        .map((row) => row.collectionId)
        .filter((value): value is string => !!value),
    );

    const unchangedTradeIds: string[] = [];
    const partialTradeIds: string[] = [];
    const deletedTradeIds: string[] = [];
    const staleHaveIds: number[] = [];
    const notifications: Array<{
      userId: string;
      tradePostId: string;
      message: string;
    }> = [];

    for (const trade of addressTrades) {
      const availableHaves: typeof trade.haves = [];
      const unavailableHaves: typeof trade.haves = [];

      for (const have of trade.haves) {
        const isOwned =
          have.serial != null
            ? ownedSet.has(`${have.collectionId}:${have.serial}`)
            : ownedCollections.has(have.collectionId);

        if (isOwned) {
          availableHaves.push(have);
        } else {
          unavailableHaves.push(have);
        }
      }

      if (unavailableHaves.length === 0) {
        unchangedTradeIds.push(trade.id);
        results.push({
          id: trade.id,
          available: true,
          removed: 0,
          remaining: availableHaves.length,
          deleted: false,
        });
        continue;
      }

      if (availableHaves.length === 0) {
        deletedTradeIds.push(trade.id);
        notifications.push({
          userId: trade.userId,
          tradePostId: trade.id,
          message:
            "Your trade post was removed because the offered objekts are no longer in your inventory.",
        });
        results.push({
          id: trade.id,
          available: false,
          removed: unavailableHaves.length,
          remaining: 0,
          deleted: true,
        });
        continue;
      }

      partialTradeIds.push(trade.id);
      const removedIds = new Set(unavailableHaves.map((have) => have.id));
      staleHaveIds.push(...unavailableHaves.map((have) => have.id));
      notifications.push({
        userId: trade.userId,
        tradePostId: trade.id,
        message: `Removed unavailable objekts from your trade post: ${formatRemovedLabels(trade, removedIds)}. If you have duplicates with different serials, you can update the trade.`,
      });
      results.push({
        id: trade.id,
        available: false,
        removed: unavailableHaves.length,
        remaining: availableHaves.length,
        deleted: false,
      });
    }

    if (deletedTradeIds.length > 0) {
      await db.delete(tradePost).where(inArray(tradePost.id, deletedTradeIds));
    }

    if (staleHaveIds.length > 0) {
      await db
        .delete(tradePostHave)
        .where(inArray(tradePostHave.id, staleHaveIds));
    }

    if (partialTradeIds.length > 0) {
      await db
        .update(tradePost)
        .set({ updatedAt: now, availabilityCheckedAt: now })
        .where(inArray(tradePost.id, partialTradeIds));
    }

    if (unchangedTradeIds.length > 0) {
      await db
        .update(tradePost)
        .set({ availabilityCheckedAt: now })
        .where(inArray(tradePost.id, unchangedTradeIds));
    }

    if (notifications.length > 0) {
      await notify(notifications);
    }
  }

  return results;
}

export async function verifyTradePostAvailability(tradeId: string) {
  const trade = await loadSingleOpenTradeForVerification(tradeId);
  if (!trade) return null;
  const [result] = await verifyLoadedTrades([trade]);
  return (
    result ?? {
      id: tradeId,
      available: true,
      removed: 0,
      remaining: trade.haves.length,
      deleted: false,
    }
  );
}

export async function verifyOpenTradesForUser(userId: string) {
  const trades = await loadTradesForVerificationBatch(
    TRADE_AVAILABILITY_BATCH_LIMIT,
    userId,
  );
  const results = await verifyLoadedTrades(trades);
  return {
    checked: trades.length,
    removed: results.filter((result) => result.deleted).length,
    updated: results.filter((result) => result.removed > 0 && !result.deleted)
      .length,
    skipped: 0,
  };
}

export async function verifyOpenTradesCron(limit = TRADE_AVAILABILITY_BATCH_LIMIT) {
  const trades = await loadTradesForVerificationBatch(limit);
  const results = await verifyLoadedTrades(trades);
  return {
    checked: trades.length,
    removed: results.filter((result) => result.deleted).length,
    updated: results.filter((result) => result.removed > 0 && !result.deleted)
      .length,
    unverifiable: results.filter((result) => result.unverifiable).length,
  };
}

export async function markTradeAvailabilityStale(tradeId: string) {
  await db
    .update(tradePost)
    .set({ availabilityCheckedAt: null })
    .where(eq(tradePost.id, tradeId));
}

export async function markTradeAvailabilityStaleMany(tradeIds: string[]) {
  if (tradeIds.length === 0) return;
  await db
    .update(tradePost)
    .set({ availabilityCheckedAt: null })
    .where(inArray(tradePost.id, tradeIds));
}
