import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { indexer } from "@/lib/db/indexer";
import { activeTrade, activeTradeSide, tradePost } from "@/lib/db/schema";
import { objekts } from "@/lib/db/indexer-schema";
import { eq, and, inArray } from "drizzle-orm";
import { getBlockingTradeId } from "@/lib/trade-guards";

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

  // Block acceptance if any objekt has already been transferred to its recipient
  // (unsolicited transfer — the sender sent before the trade was accepted)
  const preDelivered = sides.filter((s) => {
    const currentOwner = ownerMap.get(s.objektId);
    return (
      currentOwner &&
      currentOwner.toLowerCase() === s.recipientAddress.toLowerCase()
    );
  });

  if (preDelivered.length > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot accept: one or more objekts appear to have already been transferred to the recipient before this trade was accepted. This may indicate an unsolicited transfer.",
      },
      { status: 409 }
    );
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(activeTrade)
      .set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(eq(activeTrade.id, tradeId));

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

    // Temporarily hide both trade posts from the browse listing while trade is in progress
    const postIds = [trade.tradePostId, trade.matchedTradePostId].filter((id): id is string => id !== null);
    if (postIds.length > 0) {
      await tx
        .update(tradePost)
        .set({ status: "in_trade", updatedAt: now })
        .where(inArray(tradePost.id, postIds));
    }
  });

  return NextResponse.json({ status: "accepted" });
}
