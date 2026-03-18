import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import {
  activeTrade,
  activeTradeSide,
  cosmoAccount,
  tradeNotification,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getBlockingTradeId } from "@/lib/trade-guards";

interface SideInput {
  objektId: string;
  collectionId: string;
  collectionNo?: string;
  member?: string;
  serial?: number;
  thumbnailUrl?: string;
}

const MAX_CHAIN_DEPTH = 10;

async function getChainDepth(tradeId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = tradeId;
  while (currentId && depth < MAX_CHAIN_DEPTH + 1) {
    const [row] = await db
      .select({ counterOfferToId: activeTrade.counterOfferToId })
      .from(activeTrade)
      .where(eq(activeTrade.id, currentId))
      .limit(1);
    if (!row?.counterOfferToId) break;
    depth++;
    currentId = row.counterOfferToId;
  }
  return depth;
}

// POST /api/active-trades/[id]/counter-offer
// Creates a counter-offer to an existing pending trade.
// The caller must be the recipient of the original trade.
// Body:
//   myObjekts: array of objekts the counter-offerer will send (1–10)
//   theirObjekts: array of objekts they want from the other party (1–10)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 requests per 60 seconds
  const rateLimitKey = `rate-limit:initiate:${session.user.id}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) {
    await redis.expire(rateLimitKey, 60);
  }
  if (attempts > 10) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    );
  }

  const { id: originalTradeId } = await params;

  const body = await request.json();
  const { myObjekts, theirObjekts } = body as {
    myObjekts: SideInput[];
    theirObjekts: SideInput[];
  };

  if (!myObjekts?.length || !theirObjekts?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (myObjekts.length > 10 || theirObjekts.length > 10) {
    return NextResponse.json({ error: "Maximum 10 objekts per side" }, { status: 400 });
  }

  for (const o of myObjekts) {
    if (!o.objektId) {
      return NextResponse.json({ error: "All your objekts must have an objektId" }, { status: 400 });
    }
  }

  for (const o of theirObjekts) {
    if (!o.objektId) {
      return NextResponse.json({ error: "All requested objekts must have an objektId. Please select a specific serial." }, { status: 400 });
    }
  }

  // Load the original trade
  const [originalTrade] = await db
    .select()
    .from(activeTrade)
    .where(eq(activeTrade.id, originalTradeId))
    .limit(1);

  if (!originalTrade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  // Caller must be the recipient of the original trade
  if (originalTrade.recipientUserId !== session.user.id) {
    return NextResponse.json({ error: "Only the recipient can counter-offer" }, { status: 403 });
  }

  // Explicit check: cannot counter your own trade as initiator
  if (originalTrade.initiatorUserId === session.user.id) {
    return NextResponse.json({ error: "Cannot counter-offer your own trade" }, { status: 403 });
  }

  // Original trade must be pending
  if (originalTrade.status !== "pending") {
    return NextResponse.json({ error: "Can only counter-offer a pending trade" }, { status: 400 });
  }

  // Block if user has unsent objekts in an accepted trade
  const blockingTradeId = await getBlockingTradeId(session.user.id);
  if (blockingTradeId) {
    return NextResponse.json(
      { error: "You must send all your objekts in your current active trade before creating a counter-offer", activeTradeId: blockingTradeId },
      { status: 403 }
    );
  }

  // Counter-offer chain depth limit
  const depth = await getChainDepth(originalTradeId);
  if (depth >= MAX_CHAIN_DEPTH) {
    return NextResponse.json(
      { error: `Counter-offer chain limit reached (max ${MAX_CHAIN_DEPTH} rounds)` },
      { status: 400 }
    );
  }

  // Get both parties' cosmo accounts
  const [counterOffererCosmo, otherPartyCosmo] = await Promise.all([
    db.query.cosmoAccount.findFirst({
      where: eq(cosmoAccount.userId, session.user.id),
    }),
    db.query.cosmoAccount.findFirst({
      where: eq(cosmoAccount.userId, originalTrade.initiatorUserId),
    }),
  ]);

  if (!counterOffererCosmo) {
    return NextResponse.json({ error: "Link your Cosmo account first" }, { status: 403 });
  }
  if (!otherPartyCosmo) {
    return NextResponse.json({ error: "Other party has no linked Cosmo account" }, { status: 422 });
  }

  // Create the counter-offer in a transaction
  const result = await db.transaction(async (tx) => {
    // Race condition protection: re-verify original trade is still pending inside tx
    const [updated] = await tx
      .update(activeTrade)
      .set({ status: "countered", updatedAt: new Date() })
      .where(
        and(
          eq(activeTrade.id, originalTradeId),
          eq(activeTrade.status, "pending"),
        )
      )
      .returning();

    if (!updated) {
      tx.rollback();
      return null;
    }

    // Create new counter-offer trade
    // Roles flip: current user (was recipient) becomes initiator, original initiator becomes recipient
    const [newTrade] = await tx
      .insert(activeTrade)
      .values({
        counterOfferToId: originalTradeId,
        // Counter-offerer's post is the original matched post, other party's post is the original initiator's post
        tradePostId: originalTrade.matchedTradePostId,
        matchedTradePostId: originalTrade.tradePostId,
        initiatorUserId: session.user.id,
        recipientUserId: originalTrade.initiatorUserId,
        status: "pending",
      })
      .returning();

    // Counter-offerer's sides (what they will send)
    await tx.insert(activeTradeSide).values(
      myObjekts.map((o) => ({
        activeTradeId: newTrade.id,
        userId: session.user.id,
        address: counterOffererCosmo.address,
        recipientAddress: otherPartyCosmo.address,
        objektId: o.objektId,
        collectionId: o.collectionId,
        collectionNo: o.collectionNo ?? null,
        member: o.member ?? null,
        serial: o.serial ?? null,
        thumbnailUrl: o.thumbnailUrl ?? null,
        status: "pending" as const,
      }))
    );

    // Other party's sides (what counter-offerer wants from them)
    await tx.insert(activeTradeSide).values(
      theirObjekts.map((o) => ({
        activeTradeId: newTrade.id,
        userId: originalTrade.initiatorUserId,
        address: otherPartyCosmo.address,
        recipientAddress: counterOffererCosmo.address,
        objektId: o.objektId,
        collectionId: o.collectionId,
        collectionNo: o.collectionNo ?? null,
        member: o.member ?? null,
        serial: o.serial ?? null,
        thumbnailUrl: o.thumbnailUrl ?? null,
        status: "pending" as const,
      }))
    );

    // Notify the other party
    await tx.insert(tradeNotification).values({
      userId: originalTrade.initiatorUserId,
      tradePostId: null,
      message: `${session.user.name} sent you a counter-offer for Active Trade #${originalTradeId}.`,
    });

    return newTrade;
  });

  if (!result) {
    return NextResponse.json(
      { error: "Trade is no longer pending (it may have been accepted, cancelled, or already countered)" },
      { status: 409 }
    );
  }

  return NextResponse.json({ id: result.id }, { status: 201 });
}
