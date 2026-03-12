import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade, activeTradeSide, tradeNotification, tradePost } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

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

  // Block cancellation once any objekt has already been confirmed as received —
  // at that point an on-chain transfer has occurred and cannot be undone.
  if (trade.sides.some((s) => s.status === "confirmed")) {
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
