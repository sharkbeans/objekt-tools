import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

  const { id } = await params;
  const tradeId = Number(id);

  const trade = await db.query.activeTrade.findFirst({
    where: eq(activeTrade.id, tradeId),
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

  await db
    .update(activeTrade)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(activeTrade.id, tradeId));

  return NextResponse.json({ status: "cancelled" });
}
