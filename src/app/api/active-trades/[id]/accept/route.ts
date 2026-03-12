import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade, tradePost } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

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

  const { id } = await params;
  const tradeId = Number(id);

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

  await db.transaction(async (tx) => {
    await tx
      .update(activeTrade)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(activeTrade.id, tradeId));

    // Temporarily hide both trade posts from the browse listing while trade is in progress
    const postIds = [trade.tradePostId, trade.matchedTradePostId].filter((id): id is number => id !== null);
    if (postIds.length > 0) {
      await tx
        .update(tradePost)
        .set({ status: "in_trade", updatedAt: new Date() })
        .where(inArray(tradePost.id, postIds));
    }
  });

  return NextResponse.json({ status: "accepted" });
}
