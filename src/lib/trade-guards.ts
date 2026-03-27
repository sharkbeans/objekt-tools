import { db } from "@/lib/db";
import { activeTrade, activeTradeSide, tradeBan, user } from "@/lib/db/schema";
import { eq, and, or, inArray, isNull, count } from "drizzle-orm";

/**
 * Returns the blocking active trade ID if the user has an accepted/partial trade
 * where they have NOT yet sent all their objekts. Returns null if the user is free to act.
 */
export async function getBlockingTradeId(userId: string): Promise<string | null> {
  const trades = await db.query.activeTrade.findMany({
    where: and(
      or(
        eq(activeTrade.initiatorUserId, userId),
        eq(activeTrade.recipientUserId, userId),
      ),
      inArray(activeTrade.status, ["accepted", "partial"]),
    ),
    with: {
      sides: true,
    },
  });

  for (const trade of trades) {
    const userSides = trade.sides.filter((s) => s.userId === userId);
    const hasUnsent = userSides.some((s) => s.status === "pending");
    if (hasUnsent) {
      return trade.id;
    }
  }

  return null;
}

/**
 * Returns the active ban for a user, or null if not banned.
 */
export async function getActiveBan(userId: string) {
  return db.query.tradeBan.findFirst({
    where: and(
      eq(tradeBan.userId, userId),
      isNull(tradeBan.liftedAt),
    ),
  });
}

/**
 * Issues a trade ban for a user who defaulted on a trade.
 */
export async function issueBan(userId: string, cosmoId: string, activeTradeId: string, reason: string) {
  // Don't double-ban for the same trade
  const existing = await db.query.tradeBan.findFirst({
    where: and(
      eq(tradeBan.userId, userId),
      eq(tradeBan.activeTradeId, activeTradeId),
      isNull(tradeBan.liftedAt),
    ),
  });
  if (existing) return existing;

  const [ban] = await db.insert(tradeBan).values({
    cosmoId,
    userId,
    reason,
    activeTradeId,
  }).returning();
  return ban;
}

/**
 * Walks the counter-offer chain upward from terminalTradeId and sets
 * resolvedByTradeId on all ancestors that don't already have one.
 * Call this when a trade is completed or cancelled.
 */
export async function propagateResolution(terminalTradeId: string) {
  // Load the terminal trade to get its counterOfferToId
  const terminal = await db.query.activeTrade.findFirst({
    where: eq(activeTrade.id, terminalTradeId),
    columns: { counterOfferToId: true },
  });
  if (!terminal?.counterOfferToId) return;

  // Walk up the chain and collect ancestor IDs
  const ancestorIds: string[] = [];
  let currentId: string | null = terminal.counterOfferToId;
  const MAX_DEPTH = 12;
  let depth = 0;
  while (currentId && depth < MAX_DEPTH) {
    ancestorIds.push(currentId);
    const row: { counterOfferToId: string | null } | undefined = await db.query.activeTrade.findFirst({
      where: eq(activeTrade.id, currentId),
      columns: { counterOfferToId: true },
    });
    currentId = row?.counterOfferToId ?? null;
    depth++;
  }

  if (ancestorIds.length === 0) return;

  // Set resolvedByTradeId on all ancestors that don't already have it
  await db
    .update(activeTrade)
    .set({ resolvedByTradeId: terminalTradeId })
    .where(
      and(
        inArray(activeTrade.id, ancestorIds),
        isNull(activeTrade.resolvedByTradeId),
      )
    );
}

/**
 * Checks whether the user has remaining trade-offer quota.
 * Quota = user.tradeOfferQuota − count of pending active trades where the user is the initiator.
 * Returns { allowed: true, remaining } or { allowed: false, quota, used }.
 */
export async function checkTradeOfferQuota(userId: string): Promise<
  | { allowed: true; remaining: number }
  | { allowed: false; quota: number; used: number }
> {
  const [userRow] = await db
    .select({ tradeOfferQuota: user.tradeOfferQuota })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const quota = userRow?.tradeOfferQuota ?? 10;

  const [{ value: used }] = await db
    .select({ value: count() })
    .from(activeTrade)
    .where(
      and(
        eq(activeTrade.initiatorUserId, userId),
        eq(activeTrade.status, "pending"),
      )
    );

  if (used >= quota) {
    return { allowed: false, quota, used };
  }
  return { allowed: true, remaining: quota - used };
}

/**
 * Auto-lifts a ban if the user has fulfilled all obligations in the linked trade.
 */
export async function tryLiftBan(userId: string, activeTradeId: string) {
  const ban = await db.query.tradeBan.findFirst({
    where: and(
      eq(tradeBan.userId, userId),
      eq(tradeBan.activeTradeId, activeTradeId),
      isNull(tradeBan.liftedAt),
    ),
  });
  if (!ban) return;

  // Check if all user's sides in the trade are confirmed
  const sides = await db.query.activeTradeSide.findMany({
    where: and(
      eq(activeTradeSide.activeTradeId, activeTradeId),
      eq(activeTradeSide.userId, userId),
    ),
  });

  const allConfirmed = sides.length > 0 && sides.every((s) => s.status === "confirmed");
  if (allConfirmed) {
    await db
      .update(tradeBan)
      .set({ liftedAt: new Date(), liftedReason: "obligations fulfilled" })
      .where(eq(tradeBan.id, ban.id));
  }
}
