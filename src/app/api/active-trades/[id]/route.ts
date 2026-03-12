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

  const { id: tradeId } = await params;

  const trade = await db.query.activeTrade.findFirst({
    where: eq(activeTrade.id, tradeId),
    with: {
      sides: {
        with: {
          user: {
            columns: { id: true, name: true, image: true },
            with: { cosmoAccount: { columns: { nickname: true } } },
          },
        },
      },
      initiator: {
        columns: { id: true, name: true, image: true },
        with: { cosmoAccount: { columns: { nickname: true } } },
      },
      recipient: {
        columns: { id: true, name: true, image: true },
        with: { cosmoAccount: { columns: { nickname: true } } },
      },
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

  const mapped = {
    ...trade,
    initiator: {
      ...trade.initiator,
      cosmoNickname: trade.initiator.cosmoAccount?.nickname ?? null,
      cosmoAccount: undefined,
    },
    recipient: {
      ...trade.recipient,
      cosmoNickname: trade.recipient.cosmoAccount?.nickname ?? null,
      cosmoAccount: undefined,
    },
    sides: trade.sides.map((s) => ({
      ...s,
      user: {
        ...s.user,
        cosmoNickname: s.user.cosmoAccount?.nickname ?? null,
        cosmoAccount: undefined,
      },
    })),
  };

  return NextResponse.json(mapped);
}
