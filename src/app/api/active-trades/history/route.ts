import { and, desc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade } from "@/lib/db/schema";

// GET /api/active-trades/history — list completed/cancelled/disputed trades for current user
export async function GET() {
  let session: Awaited<ReturnType<typeof requireSession>>;
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
      inArray(activeTrade.status, [
        "completed",
        "cancelled",
        "countered",
        "disputed",
      ]),
    ),
    with: {
      sides: {
        with: {
          user: {
            columns: { id: true, name: true, image: true },
            with: {
              cosmoAccount: { columns: { nickname: true, address: true } },
            },
          },
        },
      },
      initiator: {
        columns: { id: true, name: true, image: true },
        with: { cosmoAccount: { columns: { nickname: true, address: true } } },
      },
      recipient: {
        columns: { id: true, name: true, image: true },
        with: { cosmoAccount: { columns: { nickname: true, address: true } } },
      },
      counterOffers: {
        columns: { id: true },
      },
    },
    orderBy: [desc(activeTrade.updatedAt)],
    limit: 100,
  });

  const mapped = trades.map((t) => ({
    ...t,
    acceptedAt: t.acceptedAt ?? null,
    counterOfferId: t.counterOffers?.[0]?.id ?? null,
    counterOffers: undefined,
    initiator: {
      ...t.initiator,
      cosmoNickname: t.initiator.cosmoAccount?.nickname ?? null,
      cosmoAddress: t.initiator.cosmoAccount?.address ?? null,
      cosmoAccount: undefined,
    },
    recipient: {
      ...t.recipient,
      cosmoNickname: t.recipient.cosmoAccount?.nickname ?? null,
      cosmoAddress: t.recipient.cosmoAccount?.address ?? null,
      cosmoAccount: undefined,
    },
    sides: t.sides.map((s) => ({
      ...s,
      user: {
        ...s.user,
        cosmoNickname: s.user.cosmoAccount?.nickname ?? null,
        cosmoAddress: s.user.cosmoAccount?.address ?? null,
        cosmoAccount: undefined,
      },
    })),
  }));

  return NextResponse.json({ trades: mapped });
}
