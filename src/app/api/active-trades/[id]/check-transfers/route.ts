import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { indexer } from "@/lib/db/indexer";
import { activeTrade, activeTradeSide, tradeNotification, tradePost } from "@/lib/db/schema";
import { objekts } from "@/lib/db/indexer-schema";
import { eq, inArray, and, or, ne } from "drizzle-orm";

// POST /api/active-trades/[id]/check-transfers
// Queries the indexer for current objekt ownership and updates side statuses.
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

  const { id: tradeId } = await params;

  const trade = await db.query.activeTrade.findFirst({
    where: eq(activeTrade.id, tradeId),
    with: { sides: true },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (
    trade.initiatorUserId !== session.user.id &&
    trade.recipientUserId !== session.user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["accepted", "partial"].includes(trade.status)) {
    return NextResponse.json({ status: trade.status, sides: trade.sides });
  }

  // Query indexer for current owners of the traded objekts
  const pendingSides = trade.sides.filter((s) => s.status !== "confirmed");
  if (pendingSides.length === 0) {
    return NextResponse.json({ status: trade.status, sides: trade.sides });
  }

  const objektIds = pendingSides.map((s) => s.objektId);
  const owned = await indexer
    .select({ id: objekts.id, owner: objekts.owner })
    .from(objekts)
    .where(inArray(objekts.id, objektIds));

  const ownerMap = new Map(owned.map((o) => [o.id, o.owner]));

  let updatedCount = 0;
  for (const side of pendingSides) {
    if (side.status === "confirmed") continue;

    const currentOwner = ownerMap.get(side.objektId);
    if (!currentOwner) continue;

    // Objekt has reached recipient address → mark as confirmed
    if (currentOwner.toLowerCase() === side.recipientAddress.toLowerCase()) {
      // Belt-and-suspenders: if the objekt was already at the recipient when the
      // trade was accepted (unsolicited transfer), do not confirm it.
      if (
        side.ownerAtAcceptance &&
        side.ownerAtAcceptance.toLowerCase() === side.recipientAddress.toLowerCase()
      ) {
        continue;
      }

      await db
        .update(activeTradeSide)
        .set({ status: "confirmed", detectedAt: new Date() })
        .where(eq(activeTradeSide.id, side.id));
      updatedCount++;
    }
    // Objekt left sender but hasn't arrived → mark as sent
    else if (currentOwner.toLowerCase() !== side.address.toLowerCase() && side.status === "pending") {
      await db
        .update(activeTradeSide)
        .set({ status: "sent" })
        .where(eq(activeTradeSide.id, side.id));
      updatedCount++;
    }
  }

  // Reload sides after updates
  const freshSides = await db.query.activeTradeSide.findMany({
    where: eq(activeTradeSide.activeTradeId, tradeId),
  });

  // Update overall trade status
  const allConfirmed = freshSides.every((s) => s.status === "confirmed");
  const anyConfirmed = freshSides.some((s) => s.status === "confirmed");

  let newTradeStatus = trade.status;
  if (allConfirmed) {
    newTradeStatus = "completed";
  } else if (anyConfirmed) {
    newTradeStatus = "partial";
  }

  if (newTradeStatus !== trade.status) {
    await db
      .update(activeTrade)
      .set({ status: newTradeStatus, updatedAt: new Date() })
      .where(eq(activeTrade.id, tradeId));

    if (newTradeStatus === "completed") {
      await db.insert(tradeNotification).values([
        {
          userId: trade.initiatorUserId,
          message: `Active Trade #${tradeId} is complete! Both objekts have been transferred.`,
        },
        {
          userId: trade.recipientUserId,
          message: `Active Trade #${tradeId} is complete! Both objekts have been transferred.`,
        },
      ]);

      // Close both trade posts permanently
      const postIds = [trade.tradePostId, trade.matchedTradePostId].filter((id): id is string => id !== null);
      if (postIds.length > 0) {
        await db
          .update(tradePost)
          .set({ status: "closed", updatedAt: new Date() })
          .where(inArray(tradePost.id, postIds));
      }

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
          await db
            .update(activeTrade)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(inArray(activeTrade.id, siblingIds));

          // Notify all parties of the sibling cancellations
          const notifications = siblingTrades.flatMap((t) => [
            {
              userId: t.initiatorUserId,
              message: `Active Trade #${t.id} was cancelled because Trade #${tradeId} completed first.`,
            },
            {
              userId: t.recipientUserId,
              message: `Active Trade #${t.id} was cancelled because Trade #${tradeId} completed first.`,
            },
          ]);
          await db.insert(tradeNotification).values(notifications);
        }
      }
    }
  }

  return NextResponse.json({
    status: newTradeStatus,
    updated: updatedCount,
    sides: freshSides,
  });
}
