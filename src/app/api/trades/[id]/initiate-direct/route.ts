import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import {
  tradePost,
  cosmoAccount,
  activeTrade,
  activeTradeSide,
} from "@/lib/db/schema";
import { notify } from "@/lib/notify";
import { eq, and } from "drizzle-orm";
import { getBlockingTradeId, getActiveBan, checkTradeOfferQuota } from "@/lib/trade-guards";
import { validateWantsOnly } from "@/lib/wants-only-validation";
import { publishUserEvent } from "@/lib/realtime";

interface SideInput {
  objektId: string;
  collectionId: string;
  collectionNo?: string;
  member?: string;
  season?: string;
  class?: string;
  artist?: string;
  serial?: number;
  thumbnailUrl?: string;
}

// POST /api/trades/[id]/initiate-direct
// Initiates an active trade against trade post [id] WITHOUT the initiator needing their own trade post.
// The initiator picks items from their inventory to send and selects from the post owner's haves.
// Body:
//   myObjekts: array of objekts the initiator will send (1–10, must have objektId)
//   theirObjekts: array of objekts the initiator wants to receive from the post owner (1–10)
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

  const activeBan = await getActiveBan(session.user.id);
  if (activeBan) {
    return NextResponse.json({ error: "You are trade banned and cannot perform this action." }, { status: 403 });
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

  const { id: matchedTradePostId } = await params;

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

  // Block if user has unsent objekts in an accepted trade
  const blockingTradeId = await getBlockingTradeId(session.user.id);
  if (blockingTradeId) {
    return NextResponse.json(
      { error: "You must send all your objekts in your current active trade before initiating a new one", activeTradeId: blockingTradeId },
      { status: 403 }
    );
  }

  // Trade offer quota check
  const quota = await checkTradeOfferQuota(session.user.id);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: `You've reached your trade offer limit (${quota.quota}). Accept, decline, or cancel existing offers to free up space.` },
      { status: 403 }
    );
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

  // Load the matched (recipient's) trade post
  const matchedPost = await db.query.tradePost.findFirst({
    where: and(
      eq(tradePost.id, matchedTradePostId),
      eq(tradePost.status, "open"),
    ),
    with: { wants: { where: (w, { isNull }) => isNull(w.deletedAt) } },
  });

  if (!matchedPost) {
    return NextResponse.json({ error: "Trade post not found or not open" }, { status: 404 });
  }

  if (matchedPost.userId === session.user.id) {
    return NextResponse.json({ error: "Cannot Send a Trade Offer with yourself" }, { status: 400 });
  }

  // Validate wants-only restriction
  if (matchedPost.wantsOnly) {
    const result = validateWantsOnly(myObjekts, matchedPost.wants);
    if (!result.valid) {
      return NextResponse.json(
        { error: "This trade only accepts offers matching its want list. One or more of your objekts don't match." },
        { status: 400 }
      );
    }
  }

  // Get initiator's cosmo address
  const initiatorCosmo = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, session.user.id),
  });
  if (!initiatorCosmo) {
    return NextResponse.json({ error: "Link your Cosmo account first" }, { status: 403 });
  }

  // Get recipient's cosmo address
  const recipientCosmo = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, matchedPost.userId),
  });
  if (!recipientCosmo) {
    return NextResponse.json({ error: "Recipient has no linked Cosmo account" }, { status: 422 });
  }

  // Only block the same user from sending a duplicate request to the same post
  const existing = await db.query.activeTrade.findFirst({
    where: and(
      eq(activeTrade.matchedTradePostId, matchedTradePostId),
      eq(activeTrade.initiatorUserId, session.user.id),
    ),
  });

  if (existing && ["pending", "accepted", "partial"].includes(existing.status)) {
    return NextResponse.json(
      { error: "You already have an active trade request for this post", id: existing.id },
      { status: 409 }
    );
  }

  // Create the active trade and all sides in one transaction
  const result = await db.transaction(async (tx) => {
    const [trade] = await tx
      .insert(activeTrade)
      .values({
        tradePostId: null,
        matchedTradePostId,
        initiatorUserId: session.user.id,
        recipientUserId: matchedPost.userId,
        status: "pending",
      })
      .returning();

    // Initiator sides: they will send myObjekts to recipient
    await tx.insert(activeTradeSide).values(
      myObjekts.map((o) => ({
        activeTradeId: trade.id,
        userId: session.user.id,
        address: initiatorCosmo.address,
        recipientAddress: recipientCosmo.address,
        objektId: o.objektId,
        collectionId: o.collectionId,
        collectionNo: o.collectionNo ?? null,
        member: o.member ?? null,
        serial: o.serial ?? null,
        thumbnailUrl: o.thumbnailUrl ?? null,
        status: "pending" as const,
      }))
    );

    // Recipient sides: they will send theirObjekts to initiator
    await tx.insert(activeTradeSide).values(
      theirObjekts.map((o) => ({
        activeTradeId: trade.id,
        userId: matchedPost.userId,
        address: recipientCosmo.address,
        recipientAddress: initiatorCosmo.address,
        objektId: o.objektId,
        collectionId: o.collectionId,
        collectionNo: o.collectionNo ?? null,
        member: o.member ?? null,
        serial: o.serial ?? null,
        thumbnailUrl: o.thumbnailUrl ?? null,
        status: "pending" as const,
      }))
    );

    return trade;
  });

  // Notify the trade post owner that they received an offer
  await notify({
    userId: matchedPost.userId,
    tradePostId: matchedTradePostId,
    activeTradeId: result.id,
    message: `${session.user.name} sent you a trade offer.`,
  });

  // Realtime: notify recipient of new offer
  void publishUserEvent(matchedPost.userId, "notification:new", {
    activeTradeId: result.id,
    message: `${session.user.name} sent you a trade offer.`,
  });

  return NextResponse.json({ id: result.id }, { status: 201 });
}
