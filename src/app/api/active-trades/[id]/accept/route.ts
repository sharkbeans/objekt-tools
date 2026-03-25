import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { indexer } from "@/lib/db/indexer";
import { redis } from "@/lib/redis";
import { activeTrade, activeTradeSide, tradePost, tradeTransferLog } from "@/lib/db/schema";
import { notify } from "@/lib/notify";
import { objekts } from "@/lib/db/indexer-schema";
import { eq, and, inArray, ne, or } from "drizzle-orm";
import { getBlockingTradeId, getActiveBan, propagateResolution } from "@/lib/trade-guards";
import { publishTradeEvent } from "@/lib/realtime";

// POST /api/active-trades/[id]/accept — recipient accepts the pending trade
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeBan = await getActiveBan(session.user.id);
  if (activeBan) {
    return NextResponse.json({ error: "You are trade banned and cannot perform this action." }, { status: 403 });
  }

  // Rate limit: 5 requests per 60 seconds
  const rateLimitKey = `rate-limit:accept:${session.user.id}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, 60);
  if (attempts > 5) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const { id: tradeId } = await params;

  const trade = await db.query.activeTrade.findFirst({
    where: and(
      eq(activeTrade.id, tradeId),
      eq(activeTrade.status, "pending"),
    ),
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found or not pending" }, { status: 404 });
  }

  // Only the recipient can accept
  if (trade.recipientUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Block if user has unsent objekts in another accepted trade
  const blockingTradeId = await getBlockingTradeId(session.user.id);
  if (blockingTradeId) {
    return NextResponse.json(
      { error: "You must send all your objekts in your current active trade before accepting another", activeTradeId: blockingTradeId },
      { status: 403 }
    );
  }

  // Load all sides of the trade for ownership verification
  const sides = await db.query.activeTradeSide.findMany({
    where: eq(activeTradeSide.activeTradeId, tradeId),
  });

  // Query indexer for current owners of all objekts in the trade
  const objektIds = sides.map((s) => s.objektId);
  const owned = await indexer
    .select({ id: objekts.id, owner: objekts.owner })
    .from(objekts)
    .where(inArray(objekts.id, objektIds));
  const ownerMap = new Map(owned.map((o) => [o.id, o.owner]));

  const now = new Date();

  // Identify pre-delivered objekts (already at recipient's address)
  const preDelivered = sides.filter((s) => {
    const currentOwner = ownerMap.get(s.objektId);
    return (
      currentOwner &&
      currentOwner.toLowerCase() === s.recipientAddress.toLowerCase()
    );
  });

  await db.transaction(async (tx) => {
    // Snapshot each objekt's current owner at acceptance time
    for (const side of sides) {
      const currentOwner = ownerMap.get(side.objektId);
      if (currentOwner) {
        await tx
          .update(activeTradeSide)
          .set({ ownerAtAcceptance: currentOwner })
          .where(eq(activeTradeSide.id, side.id));
      }
    }

    // Auto-confirm pre-delivered sides
    for (const side of preDelivered) {
      await tx
        .update(activeTradeSide)
        .set({ status: "confirmed", detectedAt: now })
        .where(eq(activeTradeSide.id, side.id));

      const recipientUserId = side.userId === trade.initiatorUserId
        ? trade.recipientUserId
        : trade.initiatorUserId;
      await tx.insert(tradeTransferLog).values({
        activeTradeId: tradeId,
        activeTradeSideId: side.id,
        fromAddress: side.address,
        toAddress: side.recipientAddress,
        objektId: side.objektId,
        collectionId: side.collectionId,
        collectionNo: side.collectionNo,
        member: side.member,
        serial: side.serial,
        senderUserId: side.userId,
        recipientUserId,
        event: "confirmed",
      });
    }

    // Determine new status based on how many sides are now confirmed
    const totalSides = sides.length;
    const confirmedCount = preDelivered.length;
    let newStatus: "accepted" | "partial" | "completed";
    if (confirmedCount === totalSides) {
      newStatus = "completed";
    } else if (confirmedCount > 0) {
      newStatus = "partial";
    } else {
      newStatus = "accepted";
    }

    // acceptanceBlock is null until the indexer exposes blockNumber on transfers.
    // When available, query the indexer for the latest block and store it here
    // to enable block-based transfer filtering in check-transfers.
    await tx
      .update(activeTrade)
      .set({ status: newStatus, acceptedAt: now, acceptanceBlock: null, updatedAt: now })
      .where(eq(activeTrade.id, tradeId));

    // Temporarily hide both trade posts from the browse listing while trade is in progress
    const postIds = [trade.tradePostId, trade.matchedTradePostId].filter((id): id is string => id !== null);
    if (postIds.length > 0) {
      await tx
        .update(tradePost)
        .set({ status: newStatus === "completed" ? "closed" : "in_trade", updatedAt: now })
        .where(inArray(tradePost.id, postIds));
    }

    // If already completed, handle post-completion tasks
    if (newStatus === "completed") {
      await notify([
        {
          userId: trade.initiatorUserId,
          activeTradeId: tradeId,
          message: `Active Trade #${tradeId} is complete! Both objekts have been transferred.`,
        },
        {
          userId: trade.recipientUserId,
          activeTradeId: tradeId,
          message: `Active Trade #${tradeId} is complete! Both objekts have been transferred.`,
        },
      ]);

      // Cancel all other pending/accepted active trades that involve either of these posts
      if (postIds.length > 0) {
        const siblingTrades = await db.query.activeTrade.findMany({
          where: and(
            ne(activeTrade.id, tradeId),
            inArray(activeTrade.status, ["pending", "accepted", "partial"]),
            or(
              ...postIds.flatMap((pid) => [
                eq(activeTrade.tradePostId, pid),
                eq(activeTrade.matchedTradePostId, pid),
              ])
            ),
          ),
          columns: { id: true, initiatorUserId: true, recipientUserId: true },
        });

        if (siblingTrades.length > 0) {
          const siblingIds = siblingTrades.map((t) => t.id);
          await tx
            .update(activeTrade)
            .set({ status: "cancelled", updatedAt: now })
            .where(inArray(activeTrade.id, siblingIds));

          const notifications = siblingTrades.flatMap((t) => [
            {
              userId: t.initiatorUserId,
              activeTradeId: t.id,
              message: `Active Trade #${t.id} was cancelled because Trade #${tradeId} completed first.`,
            },
            {
              userId: t.recipientUserId,
              activeTradeId: t.id,
              message: `Active Trade #${t.id} was cancelled because Trade #${tradeId} completed first.`,
            },
          ]);
          await notify(notifications);
        }
      }
    }
  });

  const preDeliveredCount = preDelivered.length;
  const totalSides = sides.length;
  let finalStatus: string;
  if (preDeliveredCount === totalSides) {
    finalStatus = "completed";
  } else if (preDeliveredCount > 0) {
    finalStatus = "partial";
  } else {
    finalStatus = "accepted";
  }

  // Propagate chain resolution if trade completed immediately on accept
  if (finalStatus === "completed") {
    await propagateResolution(tradeId);
  }

  // Realtime: push status event to both participants
  const event = finalStatus === "completed" ? "trade:completed" : "trade:accepted";
  void publishTradeEvent(tradeId, event, { activeTradeId: tradeId });

  return NextResponse.json({
    status: finalStatus,
    preDeliveredCount,
  });
}
