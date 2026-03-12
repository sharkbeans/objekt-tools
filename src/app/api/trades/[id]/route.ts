import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradePost } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/trades/[id] — get single trade with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tradeId } = await params;

  const trade = await db.query.tradePost.findFirst({
    where: eq(tradePost.id, tradeId),
    with: {
      haves: true,
      wants: true,
      user: {
        columns: { id: true, name: true, image: true },
        with: {
          cosmoAccount: {
            columns: { nickname: true },
          },
        },
      },
    },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...trade,
    cosmoNickname: trade.user.cosmoAccount?.nickname ?? null,
  });
}

// PATCH /api/trades/[id] — update trade status (close)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tradeId } = await params;
  const body = await request.json();

  const existing = await db.query.tradePost.findFirst({
    where: and(eq(tradePost.id, tradeId), eq(tradePost.userId, session.user.id)),
    columns: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Trade not found or not yours" }, { status: 404 });
  }

  if (existing.status === "in_trade") {
    return NextResponse.json({ error: "Cannot modify a trade post while it is part of an active trade" }, { status: 400 });
  }

  const [updated] = await db
    .update(tradePost)
    .set({ status: body.status, updatedAt: new Date() })
    .where(and(eq(tradePost.id, tradeId), eq(tradePost.userId, session.user.id)))
    .returning();

  return NextResponse.json(updated);
}

// DELETE /api/trades/[id] — delete own trade
export async function DELETE(
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

  const existing = await db.query.tradePost.findFirst({
    where: and(eq(tradePost.id, tradeId), eq(tradePost.userId, session.user.id)),
    columns: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Trade not found or not yours" }, { status: 404 });
  }

  if (existing.status === "in_trade") {
    return NextResponse.json({ error: "Cannot delete a trade post while it is part of an active trade" }, { status: 400 });
  }

  await db
    .delete(tradePost)
    .where(and(eq(tradePost.id, tradeId), eq(tradePost.userId, session.user.id)));

  return NextResponse.json({ success: true });
}
