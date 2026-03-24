import { and, count, eq, isNotNull, isNull, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  activeTrade,
  cosmoAccount,
  tradeBan,
  tradePost,
} from "@/lib/db/schema";

// GET /api/users/[nickname] — public user profile stats
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ nickname: string }> },
) {
  const { nickname } = await params;
  const session = await getSession();

  const cosmo = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.nickname, nickname),
    with: {
      user: {
        columns: { id: true, name: true, image: true, email: true },
      },
    },
  });

  if (!cosmo) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userId = cosmo.userId;
  const isOwner = session?.user.id === userId;
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
    db
      .select({ value: count() })
      .from(activeTrade)
      .where(and(userTradeFilter, eq(activeTrade.status, "completed"))),
    db
      .select({ value: count() })
      .from(activeTrade)
      .where(and(userTradeFilter, eq(activeTrade.status, "cancelled"))),
    db
      .select({ value: count() })
      .from(tradePost)
      .where(and(eq(tradePost.userId, userId), eq(tradePost.status, "open"))),
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
    t.sides.some((s) => s.userId === userId && s.status === "pending"),
  ).length;

  return NextResponse.json({
    nickname: cosmo.nickname,
    image: cosmo.user.image,
    linkedAt: cosmo.linkedAt,
    email: isOwner ? cosmo.user.email : null,
    viewer: {
      isOwner,
      userId: isOwner ? userId : null,
    },
    stats: {
      completed: completedCount,
      cancelled: cancelledCount,
      defaulted: defaultedCount,
      openPosts: openPostCount,
    },
    banned: activeBan
      ? { reason: activeBan.reason, since: activeBan.createdAt }
      : null,
  });
}
