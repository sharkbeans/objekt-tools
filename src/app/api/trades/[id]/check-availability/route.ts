export const dynamic = "force-dynamic";

import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { indexer } from "@/lib/db/indexer";
import { collections, objekts } from "@/lib/db/indexer-schema";
import { cosmoAccount, tradePost, tradePostHave } from "@/lib/db/schema";
import { notify } from "@/lib/notify";
import { redis } from "@/lib/redis";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tradeId } = await params;

  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 requests per 60 seconds
  const rateLimitKey = `rate-limit:check-avail:${session.user.id}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, 60);
  if (attempts > 10) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  // Get the trade with haves and owner info
  const trade = await db.query.tradePost.findFirst({
    where: and(eq(tradePost.id, tradeId), eq(tradePost.status, "open")),
    with: { haves: { where: (h, { isNull }) => isNull(h.deletedAt) } },
  });

  if (!trade) {
    return NextResponse.json(
      { error: "Trade not found or not open" },
      { status: 404 },
    );
  }

  if (trade.haves.length === 0) {
    return NextResponse.json({ available: true, haves: [] });
  }

  // Get the trade owner's cosmo address
  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, trade.userId),
  });

  if (!linked) {
    // Can't verify without a linked cosmo account
    return NextResponse.json({ available: true, unverifiable: true });
  }

  const allCollectionIds = [...new Set(trade.haves.map((h) => h.collectionId))];

  // Query indexer for owned objekts
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

  const ownedSet = new Set(
    ownedRows.map((r) => `${r.collectionId}:${r.serial}`),
  );
  const ownedCollections = new Set(ownedRows.map((r) => r.collectionId));

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

  // Clean up if items are missing
  if (unavailableHaves.length > 0) {
    if (availableHaves.length === 0) {
      // All haves gone — delete the trade
      await db.delete(tradePost).where(eq(tradePost.id, tradeId));
      await notify({
        userId: trade.userId,
        tradePostId: tradeId,
        message: `Your trade post was removed because all offered objekts are no longer in your inventory.`,
      });
    } else {
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

      await db.delete(tradePostHave).where(
        inArray(
          tradePostHave.id,
          unavailableHaves.map((h) => h.id),
        ),
      );
      await notify({
        userId: trade.userId,
        tradePostId: tradeId,
        message: `Removed unavailable objekts from your trade post: ${removedLabels}. If you have duplicates with different serials, you can update the trade.`,
      });
    }
  }

  return NextResponse.json({
    available: unavailableHaves.length === 0,
    removed: unavailableHaves.length,
    remaining: availableHaves.length,
    deleted: availableHaves.length === 0 && unavailableHaves.length > 0,
  });
}
