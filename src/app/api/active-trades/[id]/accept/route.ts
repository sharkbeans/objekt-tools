export const dynamic = "force-dynamic";

import { and, eq, inArray, ne, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
// Stays on the remote indexer, never the mirror — this is a live
// pre-delivery ownership check and trade-critical. See Part 2 plan, Phase 6.
import { indexer } from "@/lib/db/indexer";
import { objekts } from "@/lib/db/indexer-schema";
import {
  activeTrade,
  activeTradeSide,
  tradePost,
  tradeTransferLog,
} from "@/lib/db/schema";
import { notify } from "@/lib/notify";
import { publishTradeEvent } from "@/lib/realtime";
import { redis } from "@/lib/redis";
import {
  getActiveBan,
  getBlockingTradeId,
  propagateResolution,
} from "@/lib/trade-guards";
import { finalizeCompletedTradePosts } from "@/lib/trade-post-completion";
import { resolveCollectionUuids } from "@/lib/trade-transfer-matching";

// POST /api/active-trades/[id]/accept — recipient accepts the pending trade
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeBan = await getActiveBan(session.user.id);
  if (activeBan) {
    return NextResponse.json(
      { error: "You are trade banned and cannot perform this action." },
      { status: 403 },
    );
  }

  // Rate limit: 5 requests per 60 seconds
  const rateLimitKey = `rate-limit:accept:${session.user.id}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, 60);
  if (attempts > 5) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  const { id: tradeId } = await params;

  const trade = await db.query.activeTrade.findFirst({
    where: and(eq(activeTrade.id, tradeId), eq(activeTrade.status, "pending")),
  });

  if (!trade) {
    return NextResponse.json(
      { error: "Trade not found or not pending" },
      { status: 404 },
    );
  }

  // Only the recipient can accept
  if (trade.recipientUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Block if user has unsent objekts in another accepted trade
  const blockingTradeId = await getBlockingTradeId(session.user.id);
  if (blockingTradeId) {
    return NextResponse.json(
      {
        error:
          "You must send all your objekts in your current active trade before accepting another",
        activeTradeId: blockingTradeId,
      },
      { status: 403 },
    );
  }

  // Load all sides of the trade for ownership verification
  const sides = await db.query.activeTradeSide.findMany({
    where: eq(activeTradeSide.activeTradeId, tradeId),
  });

  // Pre-delivery is checked by collection, not the pinned objektId — any
  // objekt of the right collection already sitting at the recipient's wallet
  // counts. Query all copies of the traded collections currently held by any
  // of the trade's recipient wallets, then greedily assign one copy per side.
  const collectionSlugs = [...new Set(sides.map((s) => s.collectionId))];
  const uuidBySlug = await resolveCollectionUuids(collectionSlugs);
  const collectionUuids = [...uuidBySlug.values()];
  const slugByUuid = new Map(
    [...uuidBySlug.entries()].map(([slug, id]) => [id, slug]),
  );
  const recipientAddrs = [
    ...new Set(sides.map((s) => s.recipientAddress.toLowerCase())),
  ];

  const ownedRows =
    collectionUuids.length > 0
      ? await indexer
          .select({
            id: objekts.id,
            owner: objekts.owner,
            serial: objekts.serial,
            collectionId: objekts.collectionId,
          })
          .from(objekts)
          .where(
            and(
              inArray(objekts.collectionId, collectionUuids),
              inArray(objekts.owner, recipientAddrs),
            ),
          )
      : [];
  const sortedOwned = [...ownedRows].sort((a, b) => a.id.localeCompare(b.id));

  const claimedObjektIds = new Set<string>();
  const preDelivered: {
    side: (typeof sides)[number];
    objektId: string;
    serial: number;
  }[] = [];

  for (const side of sides) {
    const match = sortedOwned.find((o) => {
      if (claimedObjektIds.has(o.id)) return false;
      if (
        !o.collectionId ||
        slugByUuid.get(o.collectionId) !== side.collectionId
      )
        return false;
      return o.owner.toLowerCase() === side.recipientAddress.toLowerCase();
    });
    if (match) {
      claimedObjektIds.add(match.id);
      preDelivered.push({ side, objektId: match.id, serial: match.serial });
    }
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // Auto-confirm pre-delivered sides
    for (const { side, objektId, serial } of preDelivered) {
      await tx
        .update(activeTradeSide)
        .set({
          status: "confirmed",
          detectedAt: now,
          actualObjektId: objektId,
          actualSerial: serial,
        })
        .where(eq(activeTradeSide.id, side.id));

      const recipientUserId =
        side.userId === trade.initiatorUserId
          ? trade.recipientUserId
          : trade.initiatorUserId;
      await tx.insert(tradeTransferLog).values({
        activeTradeId: tradeId,
        activeTradeSideId: side.id,
        fromAddress: side.address,
        toAddress: side.recipientAddress,
        objektId,
        collectionId: side.collectionId,
        collectionNo: side.collectionNo,
        member: side.member,
        serial,
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
      .set({
        status: newStatus,
        acceptedAt: now,
        acceptanceBlock: null,
        updatedAt: now,
      })
      .where(eq(activeTrade.id, tradeId));

    // Temporarily hide both trade posts while the trade is in progress. If it
    // completed from pre-delivery, consume only the selected post entries.
    const postIds = [trade.tradePostId, trade.matchedTradePostId].filter(
      (id): id is string => id !== null,
    );
    if (newStatus === "completed") {
      await finalizeCompletedTradePosts(tx, { ...trade, sides }, now);
    } else if (postIds.length > 0) {
      await tx
        .update(tradePost)
        .set({
          status: "in_trade",
          updatedAt: now,
        })
        .where(inArray(tradePost.id, postIds));
    }

    // If already completed, handle post-completion tasks
    if (newStatus === "completed") {
      await notify([
        {
          userId: trade.initiatorUserId,
          activeTradeId: tradeId,
          message: `This trade is complete! Objekts from both sides have been transferred.`,
        },
        {
          userId: trade.recipientUserId,
          activeTradeId: tradeId,
          message: `This trade is complete! Objekts from both sides have been transferred.`,
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
              ]),
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
              message: `This trade was cancelled because another trade completed first.`,
            },
            {
              userId: t.recipientUserId,
              activeTradeId: t.id,
              message: `This trade was cancelled because another trade completed first.`,
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

  // Notify both parties when the trade is accepted (not completed — completion has its own notify above)
  if (finalStatus === "accepted" || finalStatus === "partial") {
    await notify([
      {
        userId: trade.recipientUserId,
        activeTradeId: tradeId,
        message: `You have accepted a trade. Please send your objekts.`,
      },
      {
        userId: trade.initiatorUserId,
        activeTradeId: tradeId,
        message: `${session.user.name} accepted your trade offer. Please send your objekts.`,
      },
    ]);
  }

  // Realtime: push status event to both participants
  const event =
    finalStatus === "completed" ? "trade:completed" : "trade:accepted";
  void publishTradeEvent(tradeId, event, { activeTradeId: tradeId });

  return NextResponse.json({
    status: finalStatus,
    preDeliveredCount,
  });
}
