import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade } from "@/lib/db/schema";
import { or, eq, and, desc, inArray } from "drizzle-orm";

// GET /api/active-trades/history — list completed/cancelled/disputed trades for current user
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trades = await db.query.activeTrade.findMany({
    where: and(
      or(
        eq(activeTrade.initiatorUserId, session.user.id),
        eq(activeTrade.recipientUserId, session.user.id),
      ),
      inArray(activeTrade.status, ["completed", "cancelled", "countered", "disputed"]),
    ),
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
    orderBy: [desc(activeTrade.updatedAt)],
  });

  const mapped = trades.map((t) => ({
    ...t,
    initiator: {
      ...t.initiator,
      cosmoNickname: t.initiator.cosmoAccount?.nickname ?? null,
      cosmoAccount: undefined,
    },
    recipient: {
      ...t.recipient,
      cosmoNickname: t.recipient.cosmoAccount?.nickname ?? null,
      cosmoAccount: undefined,
    },
    sides: t.sides.map((s) => ({
      ...s,
      user: {
        ...s.user,
        cosmoNickname: s.user.cosmoAccount?.nickname ?? null,
        cosmoAccount: undefined,
      },
    })),
  }));

  return NextResponse.json({ trades: mapped });
}
