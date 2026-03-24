import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activeTrade, tradeNotification, tradePost, tradeTransferLog } from "@/lib/db/schema";
import { and, eq, lt, inArray, isNotNull } from "drizzle-orm";

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

  // 3. Cancel pending counter-offers past their expiresAt deadline
  const expiredCounterOffers = await db.query.activeTrade.findMany({
    where: and(
      eq(activeTrade.status, "pending"),
      isNotNull(activeTrade.expiresAt),
      lt(activeTrade.expiresAt, now),
    ),
    columns: { id: true, initiatorUserId: true, recipientUserId: true },
  });

  if (expiredCounterOffers.length > 0) {
    const expiredCoIds = expiredCounterOffers.map((t) => t.id);

    await db
      .update(activeTrade)
      .set({ status: "cancelled", updatedAt: now })
      .where(inArray(activeTrade.id, expiredCoIds));

    const coNotifications = expiredCounterOffers.flatMap((t) => [
      {
        userId: t.initiatorUserId,
        message: `Your counter-offer (Active Trade #${t.id}) expired after 48 hours with no response.`,
      },
      {
        userId: t.recipientUserId,
        message: `A counter-offer (Active Trade #${t.id}) expired after 48 hours — it was not accepted in time.`,
      },
    ]);

    await db.insert(tradeNotification).values(coNotifications);
  }

  // 4. Expire stale accepted/partial trades (30 days since acceptance)
  const acceptedCutoff = new Date();
  acceptedCutoff.setDate(acceptedCutoff.getDate() - 30);

  const staleAcceptedTrades = await db.query.activeTrade.findMany({
    where: and(
      inArray(activeTrade.status, ["accepted", "partial"]),
      isNotNull(activeTrade.acceptedAt),
      lt(activeTrade.acceptedAt, acceptedCutoff),
    ),
    columns: { id: true, initiatorUserId: true, recipientUserId: true, tradePostId: true, matchedTradePostId: true },
  });

  if (staleAcceptedTrades.length > 0) {
    const staleIds = staleAcceptedTrades.map((t) => t.id);

    await db
      .update(activeTrade)
      .set({ status: "cancelled", updatedAt: now })
      .where(inArray(activeTrade.id, staleIds));

    // Revert trade posts to "open"
    const postIdsToRevert = staleAcceptedTrades
      .flatMap((t) => [t.tradePostId, t.matchedTradePostId])
      .filter((id): id is string => id !== null);
    if (postIdsToRevert.length > 0) {
      await db
        .update(tradePost)
        .set({ status: "open", updatedAt: now })
        .where(inArray(tradePost.id, postIdsToRevert));
    }

    const staleNotifications = staleAcceptedTrades.flatMap((t) => [
      {
        userId: t.initiatorUserId,
        message: `Active Trade #${t.id} expired after 30 days without completion.`,
      },
      {
        userId: t.recipientUserId,
        message: `Active Trade #${t.id} expired after 30 days without completion.`,
      },
    ]);
    await db.insert(tradeNotification).values(staleNotifications);
  }

  // 5. Expire trades with unrecovered wrong-recipient transfers (7 days)
  const wrongRecipientCutoff = new Date();
  wrongRecipientCutoff.setDate(wrongRecipientCutoff.getDate() - 7);

  const wrongRecipientLogs = await db.query.tradeTransferLog.findMany({
    where: and(
      eq(tradeTransferLog.event, "wrong_recipient"),
      lt(tradeTransferLog.detectedAt, wrongRecipientCutoff),
    ),
  });

  // Filter to trades that are still active and have no corresponding "recovered" log
  const wrongRecipientTradeIds = [...new Set(wrongRecipientLogs.map((l) => l.activeTradeId))];
  const tradesToExpireForWrongRecipient: string[] = [];

  for (const tradeIdToCheck of wrongRecipientTradeIds) {
    // Check if trade is still active
    const trade = await db.query.activeTrade.findFirst({
      where: and(
        eq(activeTrade.id, tradeIdToCheck),
        inArray(activeTrade.status, ["accepted", "partial"]),
      ),
    });
    if (!trade) continue;

    // Check if the wrong-recipient objekts have been recovered
    const wrongLogs = wrongRecipientLogs.filter((l) => l.activeTradeId === tradeIdToCheck);
    const recoveredLogs = await db.query.tradeTransferLog.findMany({
      where: and(
        eq(tradeTransferLog.activeTradeId, tradeIdToCheck),
        eq(tradeTransferLog.event, "recovered"),
      ),
    });
    const recoveredObjektIds = new Set(recoveredLogs.map((l) => l.objektId));
    const hasUnrecovered = wrongLogs.some((l) => !recoveredObjektIds.has(l.objektId));

    if (hasUnrecovered) {
      tradesToExpireForWrongRecipient.push(tradeIdToCheck);
    }
  }

  if (tradesToExpireForWrongRecipient.length > 0) {
    const wrongRecipientTrades = await db.query.activeTrade.findMany({
      where: inArray(activeTrade.id, tradesToExpireForWrongRecipient),
      columns: { id: true, initiatorUserId: true, recipientUserId: true, tradePostId: true, matchedTradePostId: true },
    });

    await db
      .update(activeTrade)
      .set({ status: "cancelled", updatedAt: now })
      .where(inArray(activeTrade.id, tradesToExpireForWrongRecipient));

    const wrPostIds = wrongRecipientTrades
      .flatMap((t) => [t.tradePostId, t.matchedTradePostId])
      .filter((id): id is string => id !== null);
    if (wrPostIds.length > 0) {
      await db
        .update(tradePost)
        .set({ status: "open", updatedAt: now })
        .where(inArray(tradePost.id, wrPostIds));
    }

    const wrNotifications = wrongRecipientTrades.flatMap((t) => [
      {
        userId: t.initiatorUserId,
        message: `Active Trade #${t.id} was cancelled because a misrouted transfer was not recovered within 7 days.`,
      },
      {
        userId: t.recipientUserId,
        message: `Active Trade #${t.id} was cancelled because a misrouted transfer was not recovered within 7 days.`,
      },
    ]);
    await db.insert(tradeNotification).values(wrNotifications);
  }

  return NextResponse.json({
    expiredPosts: expiredPosts.length,
    expiredTrades: expiredTrades.length,
    expiredCounterOffers: expiredCounterOffers.length,
    expiredAcceptedTrades: staleAcceptedTrades.length,
    expiredWrongRecipientTrades: tradesToExpireForWrongRecipient.length,
  });
}
