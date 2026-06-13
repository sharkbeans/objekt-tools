import { and, eq, inArray, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade, tradePost } from "@/lib/db/schema";

// POST /api/trades/[id]/renew — reopen a closed trade post
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tradeId } = await params;

  const existing = await db.query.tradePost.findFirst({
    where: and(
      eq(tradePost.id, tradeId),
      eq(tradePost.userId, session.user.id),
    ),
    columns: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Trade not found or not yours" },
      { status: 404 },
    );
  }

  if (existing.status === "open") {
    return NextResponse.json(
      { error: "Trade post is already open" },
      { status: 400 },
    );
  }

  if (existing.status === "in_trade") {
    return NextResponse.json(
      { error: "Cannot renew a trade post that is part of an active trade" },
      { status: 400 },
    );
  }

  // Check no active trades reference this post
  const hasActiveTrade = await db.query.activeTrade.findFirst({
    where: and(
      or(
        eq(activeTrade.tradePostId, tradeId),
        eq(activeTrade.matchedTradePostId, tradeId),
      ),
      inArray(activeTrade.status, ["pending", "accepted", "partial"]),
    ),
    columns: { id: true },
  });

  if (hasActiveTrade) {
    return NextResponse.json(
      { error: "Cannot renew while this post has active trades" },
      { status: 400 },
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(tradePost)
    .set({ status: "open", createdAt: now, updatedAt: now })
    .where(
      and(eq(tradePost.id, tradeId), eq(tradePost.userId, session.user.id)),
    )
    .returning();

  return NextResponse.json(updated);
}
