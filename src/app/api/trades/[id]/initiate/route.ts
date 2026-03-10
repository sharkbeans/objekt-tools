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

// POST /api/trades/[id]/initiate
// Initiates an active trade between the current user and the owner of the trade post [id].
// Body:
//   myObjekt: the specific objekt the initiator will send
//   theirObjekt: the specific objekt the initiator is requesting from the matched post
//   matchedTradePostId: the matched trade post id that belongs to the recipient
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
  const tradePostId = Number(id);

  const body = await request.json();
  const { myObjekt, theirObjekt, matchedTradePostId } = body as {
    myObjekt: SideInput;
    theirObjekt: SideInput;
    matchedTradePostId: number;
  };

  if (!myObjekt || !theirObjekt || !matchedTradePostId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Load the initiator's own trade post (the one they're offering from)
  const myPost = await db.query.tradePost.findFirst({
    where: and(
      eq(tradePost.id, tradePostId),
      eq(tradePost.userId, session.user.id),
      eq(tradePost.status, "open"),
    ),
  });

  if (!myPost) {
    return NextResponse.json({ error: "Your trade post not found or not open" }, { status: 404 });
  }

  // Load the matched (recipient's) trade post
  const matchedPost = await db.query.tradePost.findFirst({
    where: and(
      eq(tradePost.id, matchedTradePostId),
      eq(tradePost.status, "open"),
    ),
  });

  if (!matchedPost) {
    return NextResponse.json({ error: "Matched trade post not found or not open" }, { status: 404 });
  }

  // Don't allow trading with yourself
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

  // Check there's no existing active trade between these two posts already
  const existing = await db.query.activeTrade.findFirst({
    where: and(
      eq(activeTrade.tradePostId, tradePostId),
      eq(activeTrade.matchedTradePostId, matchedTradePostId),
      eq(activeTrade.initiatorUserId, session.user.id),
    ),
  });

  if (existing && ["pending", "accepted", "partial"].includes(existing.status)) {
    return NextResponse.json(
      { error: "An active trade already exists for these posts", id: existing.id },
      { status: 409 }
    );
  }

  // Check if the other user already initiated a trade in the reverse direction.
  // If so, auto-accept it instead of creating a duplicate.
  const reverseExisting = await db.query.activeTrade.findFirst({
    where: and(
      eq(activeTrade.tradePostId, matchedTradePostId),
      eq(activeTrade.matchedTradePostId, tradePostId),
      eq(activeTrade.initiatorUserId, matchedPost.userId),
      eq(activeTrade.recipientUserId, session.user.id),
      eq(activeTrade.status, "pending"),
    ),
  });

  if (reverseExisting) {
    await db
      .update(activeTrade)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(activeTrade.id, reverseExisting.id));

    return NextResponse.json({ id: reverseExisting.id, autoAccepted: true }, { status: 200 });
  }

  // Create the active trade and both sides in one transaction
  const result = await db.transaction(async (tx) => {
    const [trade] = await tx
      .insert(activeTrade)
      .values({
        tradePostId,
        matchedTradePostId,
        initiatorUserId: session.user.id,
        recipientUserId: matchedPost.userId,
        status: "pending",
      })
      .returning();

    // Initiator side: they will send myObjekt to recipient
    await tx.insert(activeTradeSide).values({
      activeTradeId: trade.id,
      userId: session.user.id,
      address: initiatorCosmo.address,
      recipientAddress: recipientCosmo.address,
      objektId: myObjekt.objektId,
      collectionId: myObjekt.collectionId,
      collectionNo: myObjekt.collectionNo ?? null,
      member: myObjekt.member ?? null,
      serial: myObjekt.serial ?? null,
      thumbnailUrl: myObjekt.thumbnailUrl ?? null,
      status: "pending",
    });

    // Recipient side: they will send theirObjekt to initiator
    await tx.insert(activeTradeSide).values({
      activeTradeId: trade.id,
      userId: matchedPost.userId,
      address: recipientCosmo.address,
      recipientAddress: initiatorCosmo.address,
      objektId: theirObjekt.objektId,
      collectionId: theirObjekt.collectionId,
      collectionNo: theirObjekt.collectionNo ?? null,
      member: theirObjekt.member ?? null,
      serial: theirObjekt.serial ?? null,
      thumbnailUrl: theirObjekt.thumbnailUrl ?? null,
      status: "pending",
    });

    return trade;
  });

  return NextResponse.json({ id: result.id }, { status: 201 });
}
