import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  tradePost,
  cosmoAccount,
  activeTrade,
  activeTradeSide,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

interface SideInput {
  objektId: string;
  collectionId: string;
  collectionNo?: string;
  member?: string;
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

  const { id } = await params;
  const matchedTradePostId = Number(id);

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

  // Load the matched (recipient's) trade post
  const matchedPost = await db.query.tradePost.findFirst({
    where: and(
      eq(tradePost.id, matchedTradePostId),
      eq(tradePost.status, "open"),
    ),
  });

  if (!matchedPost) {
    return NextResponse.json({ error: "Trade post not found or not open" }, { status: 404 });
  }

  if (matchedPost.userId === session.user.id) {
    return NextResponse.json({ error: "Cannot initiate trade with yourself" }, { status: 400 });
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

  // Check for existing active trade from this initiator against this post
  const existing = await db.query.activeTrade.findFirst({
    where: and(
      eq(activeTrade.matchedTradePostId, matchedTradePostId),
      eq(activeTrade.initiatorUserId, session.user.id),
    ),
  });

  if (existing && ["pending", "accepted", "partial"].includes(existing.status)) {
    return NextResponse.json(
      { error: "An active trade already exists for this post", id: existing.id },
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
        objektId: o.objektId ?? "",
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

  return NextResponse.json({ id: result.id }, { status: 201 });
}
