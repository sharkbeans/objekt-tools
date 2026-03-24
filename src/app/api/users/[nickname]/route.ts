import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cosmoAccount, activeTrade, tradePost, tradeBan } from "@/lib/db/schema";
import { eq, and, or, isNull, isNotNull, sql, count } from "drizzle-orm";

// GET /api/users/[nickname] — public user profile stats
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ nickname: string }> }
) {
  const { nickname } = await params;

  const cosmo = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.nickname, nickname),
    with: {
      user: {
        columns: { id: true, name: true, image: true },
      },
    },
  });

  if (!cosmo) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userId = cosmo.userId;
  const userTradeFilter = or(
    eq(activeTrade.initiatorUserId, userId),
    eq(activeTrade.recipientUserId, userId),
  );

  const [
    [{ value: completedCount }],
    [{ value: cancelledCount }],
    [{ value: openPostCount }],
    activeBan,
    defaultedTrades,
  ] = await Promise.all([
    db.select({ value: count() }).from(activeTrade).where(and(userTradeFilter, eq(activeTrade.status, "completed"))),
    db.select({ value: count() }).from(activeTrade).where(and(userTradeFilter, eq(activeTrade.status, "cancelled"))),
    db.select({ value: count() }).from(tradePost).where(and(eq(tradePost.userId, userId), eq(tradePost.status, "open"))),
    db.query.tradeBan.findFirst({
      where: and(eq(tradeBan.userId, userId), isNull(tradeBan.liftedAt)),
      columns: { id: true, reason: true, createdAt: true },
    }),
    // Defaulted: cancelled after acceptance, user had unsent sides
    db.query.activeTrade.findMany({
      where: and(
        userTradeFilter,
        eq(activeTrade.status, "cancelled"),
        isNotNull(activeTrade.acceptedAt),
      ),
      with: { sides: true },
      columns: { id: true },
    }),
  ]);

  const defaultedCount = defaultedTrades.filter((t) =>
    t.sides.some((s) => s.userId === userId && s.status === "pending")
  ).length;

  return NextResponse.json({
    nickname: cosmo.nickname,
    image: cosmo.user.image,
    linkedAt: cosmo.linkedAt,
    stats: {
      completed: completedCount,
      cancelled: cancelledCount,
      defaulted: defaultedCount,
      openPosts: openPostCount,
    },
    banned: activeBan ? { reason: activeBan.reason, since: activeBan.createdAt } : null,
  });
}
