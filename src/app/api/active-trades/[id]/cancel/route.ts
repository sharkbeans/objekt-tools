import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade, tradeNotification, tradePost } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

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

  if (trade.status === "completed" || trade.status === "cancelled") {
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
  });

  const cancellerName = session.user.name;
  const otherUserId =
    trade.initiatorUserId === session.user.id
      ? trade.recipientUserId
      : trade.initiatorUserId;

  await db.insert(tradeNotification).values([
    {
      userId: session.user.id,
      message: `You cancelled Active Trade #${tradeId}.`,
    },
    {
      userId: otherUserId,
      message: `${cancellerName} cancelled Active Trade #${tradeId}.`,
    },
  ]);

  return NextResponse.json({ status: "cancelled" });
}
