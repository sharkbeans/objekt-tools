import { and, count, eq, ilike, isNotNull, isNull, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { fetchUserByNickname } from "@/lib/cosmo/client";
import { db } from "@/lib/db";
import {
  activeTrade,
  cosmoAccount,
  tradeBan,
  tradePost,
} from "@/lib/db/schema";
import { getCached } from "@/lib/server-cache";

function isWalletAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

// GET /api/users/[address] — public user profile stats
// Accepts: wallet address (0x...) or cosmo nickname (falls back to Cosmo API lookup)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: identifier } = await params;
  const session = await getSession();

  let cosmo;

  if (isWalletAddress(identifier)) {
    // Direct address lookup
    cosmo = await db.query.cosmoAccount.findFirst({
      where: eq(cosmoAccount.address, identifier.toLowerCase()),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            image: true,
            email: true,
            discordId: true,
            discordUsername: true,
          },
        },
      },
    });
    // If the user has a nickname, redirect to the prettier /@nickname URL
    if (cosmo?.nickname) {
      return NextResponse.json({ nickname: cosmo.nickname }, { status: 301 });
    }
  } else {
    // Treat as nickname — try DB first (case-insensitive)
    cosmo = await db.query.cosmoAccount.findFirst({
      where: ilike(cosmoAccount.nickname, identifier),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            image: true,
            email: true,
            discordId: true,
            discordUsername: true,
          },
        },
      },
    });

    if (!cosmo) {
      // Fall back to Cosmo API to resolve nickname → address
      const resolved = await fetchUserByNickname(identifier);
      if (!resolved) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      // Return a redirect hint so the client can navigate to the address URL
      return NextResponse.json(
        { address: resolved.address.toLowerCase() },
        { status: 301 },
      );
    }

    // Nickname found in DB — already at canonical URL, proceed to profile
  }

  if (!cosmo) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userId = cosmo.userId;
  const isOwner = session?.user.id === userId;
  const userTradeFilter = or(
    eq(activeTrade.initiatorUserId, userId),
    eq(activeTrade.recipientUserId, userId),
  );

  const {
    completedCount,
    cancelledCount,
    openPostCount,
    activeBan,
    defaultedTrades,
  } = await getCached(`user-profile-stats:${userId}`, 60_000, async () => {
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
        limit: 500,
      }),
    ]);
    return {
      completedCount,
      cancelledCount,
      openPostCount,
      activeBan,
      defaultedTrades,
    };
  });

  const defaultedCount = defaultedTrades.filter((t) =>
    t.sides.some((s) => s.userId === userId && s.status === "pending"),
  ).length;

  return NextResponse.json({
    address: cosmo.address,
    nickname: cosmo.nickname ?? null,
    image: cosmo.user.image,
    linkedAt: cosmo.linkedAt,
    email: isOwner ? cosmo.user.email : null,
    // Discord username is shown publicly on profiles and to trade partners
    discordId: cosmo.user.discordId ?? null,
    discordUsername: cosmo.user.discordUsername ?? null,
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
