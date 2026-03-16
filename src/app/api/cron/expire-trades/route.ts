import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activeTrade, tradeNotification, tradePost } from "@/lib/db/schema";
import { and, eq, lt, inArray } from "drizzle-orm";

// GET /api/cron/expire-trades
// Called by Vercel Cron once per day.
// 1. Closes trade posts older than 30 days (does NOT cancel their associated accepted/partial active trades)
// 2. Cancels pending (not yet accepted) active trades older than 30 days
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const now = new Date();

  // 1. Expire old trade posts — close them so they no longer appear in browse
  const expiredPosts = await db
    .update(tradePost)
    .set({ status: "closed", updatedAt: now })
    .where(
      and(
        eq(tradePost.status, "open"),
        lt(tradePost.createdAt, cutoff),
      )
    )
    .returning({ id: tradePost.id, userId: tradePost.userId });

  const postNotifications = expiredPosts.map((p) => ({
    userId: p.userId,
    message: `Your trade post #${p.id} was closed after 30 days.`,
  }));

  if (postNotifications.length > 0) {
    await db.insert(tradeNotification).values(postNotifications);
  }

  // 2. Cancel pending active trades older than 30 days (never accepted)
  const expiredTrades = await db.query.activeTrade.findMany({
    where: and(
      eq(activeTrade.status, "pending"),
      lt(activeTrade.createdAt, cutoff),
    ),
    columns: { id: true, initiatorUserId: true, recipientUserId: true },
  });

  if (expiredTrades.length > 0) {
    const expiredIds = expiredTrades.map((t) => t.id);

    await db
      .update(activeTrade)
      .set({ status: "cancelled", updatedAt: now })
      .where(inArray(activeTrade.id, expiredIds));

    const tradeNotifications = expiredTrades.flatMap((t) => [
      {
        userId: t.initiatorUserId,
        message: `Active Trade #${t.id} expired after 30 days with no response.`,
      },
      {
        userId: t.recipientUserId,
        message: `Active Trade #${t.id} expired after 30 days — the trade request was not accepted in time.`,
      },
    ]);

    await db.insert(tradeNotification).values(tradeNotifications);
  }

  return NextResponse.json({
    expiredPosts: expiredPosts.length,
    expiredTrades: expiredTrades.length,
  });
}
