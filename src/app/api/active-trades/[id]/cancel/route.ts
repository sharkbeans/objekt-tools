import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade, tradeNotification, tradePost, tradeTransferLog } from "@/lib/db/schema";
import { eq, inArray, and, or } from "drizzle-orm";

const CANCEL_TIMEOUT_HOURS = 24;

// POST /api/active-trades/[id]/cancel — either participant cancels
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

  if (trade.status === "completed" || trade.status === "cancelled" || trade.status === "countered") {
    return NextResponse.json({ error: "Trade already finalised" }, { status: 400 });
  }

  // Determine which sides belong to which party
  const mySides = trade.sides.filter((s) => s.userId === session.user.id);
  const otherSides = trade.sides.filter((s) => s.userId !== session.user.id);

  const myConfirmed = mySides.every((s) => s.status === "confirmed");
  const otherConfirmed = otherSides.every((s) => s.status === "confirmed");
  const myAllPending = mySides.every((s) => s.status === "pending");
  const otherAllPending = otherSides.every((s) => s.status === "pending");

  // Both parties have confirmed — trade should complete, cannot cancel
  if (myConfirmed && otherConfirmed) {
    return NextResponse.json(
      { error: "Cannot cancel: both parties have already transferred. The trade should complete shortly." },
      { status: 400 }
    );
  }

  // Path A: Neither side has sent anything — either party can cancel freely
  const noOneSent = trade.sides.every((s) => s.status === "pending");

  // Path B: I haven't sent anything, other party has confirmed — I can back out
  const iCanBackOut = myAllPending && otherConfirmed;

  // Path C: I've confirmed but other party hasn't sent — allow cancel after timeout
  let timeoutExpired = false;
  if (myConfirmed && otherAllPending && trade.acceptedAt) {
    const hoursSinceAcceptance = (Date.now() - trade.acceptedAt.getTime()) / (1000 * 60 * 60);
    timeoutExpired = hoursSinceAcceptance >= CANCEL_TIMEOUT_HOURS;
  }

  if (!noOneSent && !iCanBackOut && !timeoutExpired) {
    if (myConfirmed && otherAllPending) {
      return NextResponse.json(
        { error: `Cannot cancel yet: you must wait ${CANCEL_TIMEOUT_HOURS} hours after acceptance before cancelling when you've already sent. Contact support if there is a dispute.` },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Cannot cancel: at least one objekt has already been transferred. Contact support if there is a dispute." },
      { status: 400 }
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(activeTrade)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(activeTrade.id, tradeId));

    // If the trade had been accepted (posts were hidden), restore them to open
    if (["accepted", "partial"].includes(trade.status)) {
      const postIds = [trade.tradePostId, trade.matchedTradePostId].filter((id): id is string => id !== null);
      if (postIds.length > 0) {
        await tx
          .update(tradePost)
          .set({ status: "open", updatedAt: new Date() })
          .where(inArray(tradePost.id, postIds));
      }
    }

    // For any cancellation: check if either trade post has remaining active trades.
    // If not, revert "in_trade" posts back to "open" so they aren't stuck.
    const postIdsToCheck = [trade.tradePostId, trade.matchedTradePostId].filter((id): id is string => id !== null);
    for (const postId of postIdsToCheck) {
      const remainingTrade = await tx.query.activeTrade.findFirst({
        where: and(
          or(
            eq(activeTrade.tradePostId, postId),
            eq(activeTrade.matchedTradePostId, postId),
          ),
          inArray(activeTrade.status, ["pending", "accepted", "partial"]),
        ),
      });
      if (!remainingTrade) {
        await tx
          .update(tradePost)
          .set({ status: "open", updatedAt: new Date() })
          .where(and(eq(tradePost.id, postId), eq(tradePost.status, "in_trade")));
      }
    }
  });

  const cancellerName = session.user.name;
  const otherUserId =
    trade.initiatorUserId === session.user.id
      ? trade.recipientUserId
      : trade.initiatorUserId;

  // Check if the other party had sent any objekts pre-accept (only relevant for pending trades)
  let otherPartyPreSentCount = 0;
  if (trade.status === "pending") {
    const preAcceptLogs = await db.query.tradeTransferLog.findMany({
      where: and(
        eq(tradeTransferLog.activeTradeId, tradeId),
        eq(tradeTransferLog.senderUserId, otherUserId),
        eq(tradeTransferLog.event, "pre_accept_sent"),
      ),
    });
    otherPartyPreSentCount = preAcceptLogs.length;
  }

  const cancellerMsg = otherPartyPreSentCount > 0
    ? `You cancelled Active Trade #${tradeId}. The other party had already sent ${otherPartyPreSentCount} objekt(s) — please return them.`
    : `You cancelled Active Trade #${tradeId}.`;

  const otherMsg = otherPartyPreSentCount > 0
    ? `${cancellerName} cancelled Active Trade #${tradeId}. They have been asked to return your ${otherPartyPreSentCount} objekt(s).`
    : `${cancellerName} cancelled Active Trade #${tradeId}.`;

  await db.insert(tradeNotification).values([
    {
      userId: session.user.id,
      activeTradeId: tradeId,
      message: cancellerMsg,
    },
    {
      userId: otherUserId,
      activeTradeId: tradeId,
      message: otherMsg,
    },
  ]);

  return NextResponse.json({ status: "cancelled" });
}
