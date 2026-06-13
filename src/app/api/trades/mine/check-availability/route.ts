export const dynamic = "force-dynamic";

import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { indexer } from "@/lib/db/indexer";
import { collections, objekts } from "@/lib/db/indexer-schema";
import { cosmoAccount, tradePost, tradePostHave } from "@/lib/db/schema";
import { notify } from "@/lib/notify";

export async function POST() {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's cosmo address
  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, session.user.id),
  });
  if (!linked) {
    return NextResponse.json(
      { error: "Cosmo account not linked" },
      { status: 404 },
    );
  }

  // Get all open trades for this user with their haves
  const trades = await db.query.tradePost.findMany({
    where: and(
      eq(tradePost.userId, session.user.id),
      eq(tradePost.status, "open"),
    ),
    with: { haves: { where: (h, { isNull }) => isNull(h.deletedAt) } },
  });

  if (trades.length === 0) {
    return NextResponse.json({ checked: 0, removed: 0, updated: 0 });
  }

  // Collect all unique collectionIds from haves
  const allCollectionIds = [
    ...new Set(trades.flatMap((t) => t.haves.map((h) => h.collectionId))),
  ];

  if (allCollectionIds.length === 0) {
    return NextResponse.json({
      checked: trades.length,
      removed: 0,
      updated: 0,
    });
  }

  // Query indexer: get all objekts owned by this user matching these collections
  const ownedRows = await indexer
    .select({
      collectionId: collections.collectionId,
      serial: objekts.serial,
    })
    .from(objekts)
    .innerJoin(collections, eq(objekts.collectionId, collections.id))
    .where(
      and(
        eq(objekts.owner, linked.address),
        inArray(collections.collectionId, allCollectionIds),
      ),
    );

  // Build a set of "collectionId:serial" keys the user owns
  const ownedSet = new Set(
    ownedRows.map((r) => `${r.collectionId}:${r.serial}`),
  );
  // Also track which collectionIds the user owns any of (for haves without serial)
  const ownedCollections = new Set(ownedRows.map((r) => r.collectionId));

  const notifications: { tradePostId: string; message: string }[] = [];
  const tradesToDelete: string[] = [];
  const havesToRemove: number[] = [];

  for (const trade of trades) {
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

    if (availableHaves.length === 0) {
      // All haves gone — delete trade
      tradesToDelete.push(trade.id);
      notifications.push({
        tradePostId: trade.id,
        message: `Your trade post was removed because all offered objekts are no longer in your inventory.`,
      });
    } else if (unavailableHaves.length > 0) {
      // Some haves gone — remove unavailable ones
      const removedLabels = unavailableHaves
        .map((h) => {
          const name =
            h.member && h.collectionNo
              ? `${h.member} ${h.collectionNo}`
              : h.collectionId;
          return h.serial != null ? `${name} #${h.serial}` : name;
        })
        .join(", ");
      havesToRemove.push(...unavailableHaves.map((h) => h.id));
      notifications.push({
        tradePostId: trade.id,
        message: `Removed unavailable objekts from your trade post: ${removedLabels}. If you have duplicates with different serials, you can update the trade.`,
      });
    }
  }

  // Execute deletions and removals
  if (tradesToDelete.length > 0) {
    await db.delete(tradePost).where(inArray(tradePost.id, tradesToDelete));
  }
  if (havesToRemove.length > 0) {
    await db
      .delete(tradePostHave)
      .where(inArray(tradePostHave.id, havesToRemove));
  }

  // Insert notifications
  if (notifications.length > 0) {
    await notify(
      notifications.map((n) => ({
        userId: session.user.id,
        tradePostId: n.tradePostId,
        message: n.message,
      })),
    );
  }

  return NextResponse.json({
    checked: trades.length,
    removed: tradesToDelete.length,
    updated:
      havesToRemove.length > 0
        ? notifications.length - tradesToDelete.length
        : 0,
  });
}
