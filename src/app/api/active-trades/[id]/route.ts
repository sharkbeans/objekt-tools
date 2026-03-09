import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/active-trades/[id]
export async function GET(
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
    with: {
      sides: {
        with: { user: { columns: { id: true, name: true, image: true } } },
      },
      initiator: { columns: { id: true, name: true, image: true } },
      recipient: { columns: { id: true, name: true, image: true } },
    },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  // Only participants can view
  if (
    trade.initiatorUserId !== session.user.id &&
    trade.recipientUserId !== session.user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(trade);
}
