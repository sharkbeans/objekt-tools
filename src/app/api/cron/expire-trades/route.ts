import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activeTrade, tradeNotification } from "@/lib/db/schema";
import { and, eq, lt, inArray } from "drizzle-orm";

// POST /api/cron/expire-trades
// Called by Vercel Cron once per day. Cancels pending (not yet accepted) active trades
// that are older than 30 days. Accepted/partial trades are never auto-expired.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  // Only expire trades that are still pending (recipient never accepted)
  const expiredTrades = await db.query.activeTrade.findMany({
    where: and(
      eq(activeTrade.status, "pending"),
      lt(activeTrade.createdAt, cutoff),
    ),
    columns: { id: true, initiatorUserId: true, recipientUserId: true },
  });

  if (expiredTrades.length === 0) {
    return NextResponse.json({ expired: 0 });
  }

  const expiredIds = expiredTrades.map((t) => t.id);

  await db
    .update(activeTrade)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(inArray(activeTrade.id, expiredIds));

  const notifications = expiredTrades.flatMap((t) => [
    {
      userId: t.initiatorUserId,
      message: `Active Trade #${t.id} expired after 30 days with no response.`,
    },
    {
      userId: t.recipientUserId,
      message: `Active Trade #${t.id} expired after 30 days — the trade request was not accepted in time.`,
    },
  ]);

  await db.insert(tradeNotification).values(notifications);

  return NextResponse.json({ expired: expiredIds.length });
}
