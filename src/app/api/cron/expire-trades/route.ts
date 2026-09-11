import crypto from "node:crypto";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  activeTrade,
  activeTradeSide,
  cosmoAccount,
  tradePost,
  tradeTransferLog,
} from "@/lib/db/schema";
import { notify } from "@/lib/notify";
import { issueBan, propagateResolution } from "@/lib/trade/trade-guards";

// GET /api/cron/expire-trades
// Called by the cron container once per day.
// 1. Closes trade posts older than 30 days (does NOT cancel their associated accepted/partial active trades)
// 2. Cancels pending (not yet accepted) active trades older than 30 days
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  let authorized = false;
  try {
    authorized =
      authHeader.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    authorized = false;
  }
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const now = new Date();

  // Every trade this run actually moved to `cancelled`, as opposed to every
  // trade it read and intended to. Each section's update is guarded on the
  // status it read, so the two lists differ exactly when something else got
  // there first — and the work that hangs off cancelling (chain resolution,
  // and the counts this endpoint reports) has to follow the write, not the
  // intention. Resolving a chain against a trade that is still live is not
  // recoverable by running the cron again.
  const cancelledTradeIds: string[] = [];

  // 1. Expire old trade posts — close them so they no longer appear in browse
  const expiredPosts = await db
    .update(tradePost)
    .set({ status: "closed", updatedAt: now })
    .where(and(eq(tradePost.status, "open"), lt(tradePost.createdAt, cutoff)))
    .returning({ id: tradePost.id, userId: tradePost.userId });

  const postNotifications = expiredPosts.map((p) => ({
    userId: p.userId,
    message: `Your trade post was closed after 30 days.`,
  }));

  if (postNotifications.length > 0) {
    await notify(postNotifications);
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

    // Guarded on the status that was read, and driven by what the write
    // actually changed. A trade accepted between the read above and this update
    // would otherwise be cancelled out from under both parties — and told it
    // "expired with no response" moments after someone responded.
    const cancelled = await db
      .update(activeTrade)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          inArray(activeTrade.id, expiredIds),
          eq(activeTrade.status, "pending"),
        ),
      )
      .returning({ id: activeTrade.id });
    cancelledTradeIds.push(...cancelled.map((t) => t.id));
    const cancelledIds = new Set(cancelled.map((t) => t.id));

    const tradeNotifications = expiredTrades
      .filter((t) => cancelledIds.has(t.id))
      .flatMap((t) => [
        {
          userId: t.initiatorUserId,
          message: `This trade expired after 30 days with no response.`,
        },
        {
          userId: t.recipientUserId,
          message: `This trade expired after 30 days — the trade request was not accepted in time.`,
        },
      ]);

    if (tradeNotifications.length > 0) await notify(tradeNotifications);
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

    const cancelledCo = await db
      .update(activeTrade)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          inArray(activeTrade.id, expiredCoIds),
          eq(activeTrade.status, "pending"),
        ),
      )
      .returning({ id: activeTrade.id });
    cancelledTradeIds.push(...cancelledCo.map((t) => t.id));
    const cancelledCoIds = new Set(cancelledCo.map((t) => t.id));

    const coNotifications = expiredCounterOffers
      .filter((t) => cancelledCoIds.has(t.id))
      .flatMap((t) => [
        {
          userId: t.initiatorUserId,
          message: `Your counter-offer expired after 48 hours with no response.`,
        },
        {
          userId: t.recipientUserId,
          message: `A counter-offer expired after 48 hours — it was not accepted in time.`,
        },
      ]);

    if (coNotifications.length > 0) await notify(coNotifications);
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
    columns: {
      id: true,
      initiatorUserId: true,
      recipientUserId: true,
      tradePostId: true,
      matchedTradePostId: true,
    },
  });

  if (staleAcceptedTrades.length > 0) {
    const staleIds = staleAcceptedTrades.map((t) => t.id);

    // The guard matters most here, because bans hang off this list. A trade
    // that completed between the read and this write would otherwise be
    // cancelled after the fact and both parties banned for defaulting on a
    // trade they had just finished.
    const cancelledStale = await db
      .update(activeTrade)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          inArray(activeTrade.id, staleIds),
          inArray(activeTrade.status, ["accepted", "partial"]),
        ),
      )
      .returning({ id: activeTrade.id });
    cancelledTradeIds.push(...cancelledStale.map((t) => t.id));
    const cancelledStaleIds = new Set(cancelledStale.map((t) => t.id));
    const expiredStale = staleAcceptedTrades.filter((t) =>
      cancelledStaleIds.has(t.id),
    );

    // Revert trade posts to "open"
    const postIdsToRevert = expiredStale
      .flatMap((t) => [t.tradePostId, t.matchedTradePostId])
      .filter((id): id is string => id !== null);
    if (postIdsToRevert.length > 0) {
      await db
        .update(tradePost)
        .set({ status: "open", updatedAt: now })
        .where(inArray(tradePost.id, postIdsToRevert));
    }

    const staleNotifications = expiredStale.flatMap((t) => [
      {
        userId: t.initiatorUserId,
        message: `This trade expired after 30 days without completion.`,
      },
      {
        userId: t.recipientUserId,
        message: `This trade expired after 30 days without completion.`,
      },
    ]);
    if (staleNotifications.length > 0) await notify(staleNotifications);

    // Issue bans to users with unsent sides, but only if the other party had confirmed.
    // If both parties ghosted (both sides still pending), nobody gets banned.
    for (const t of expiredStale) {
      const sides = await db.query.activeTradeSide.findMany({
        where: eq(activeTradeSide.activeTradeId, t.id),
      });
      const unsentUserIds = [
        ...new Set(
          sides.filter((s) => s.status === "pending").map((s) => s.userId),
        ),
      ];
      for (const userId of unsentUserIds) {
        const otherUserId =
          userId === t.initiatorUserId ? t.recipientUserId : t.initiatorUserId;
        const otherSides = sides.filter((s) => s.userId === otherUserId);
        const otherSent =
          otherSides.length > 0 &&
          otherSides.every((s) => s.status === "confirmed");
        if (!otherSent) continue; // Both ghosted — no ban
        const cosmo = await db.query.cosmoAccount.findFirst({
          where: eq(cosmoAccount.userId, userId),
          columns: { cosmoId: true, address: true },
        });
        const cosmoId = cosmo?.cosmoId?.toString() ?? cosmo?.address ?? userId;
        await issueBan(
          userId,
          cosmoId,
          t.id,
          `Defaulted on Active Trade #${t.id} (expired after 30 days without completion).`,
        );
      }
    }
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
  const wrongRecipientTradeIds = [
    ...new Set(wrongRecipientLogs.map((l) => l.activeTradeId)),
  ];
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
    const wrongLogs = wrongRecipientLogs.filter(
      (l) => l.activeTradeId === tradeIdToCheck,
    );
    const recoveredLogs = await db.query.tradeTransferLog.findMany({
      where: and(
        eq(tradeTransferLog.activeTradeId, tradeIdToCheck),
        eq(tradeTransferLog.event, "recovered"),
      ),
    });
    const recoveredObjektIds = new Set(recoveredLogs.map((l) => l.objektId));
    const hasUnrecovered = wrongLogs.some(
      (l) => !recoveredObjektIds.has(l.objektId),
    );

    if (hasUnrecovered) {
      tradesToExpireForWrongRecipient.push(tradeIdToCheck);
    }
  }

  if (tradesToExpireForWrongRecipient.length > 0) {
    const wrongRecipientTrades = await db.query.activeTrade.findMany({
      where: inArray(activeTrade.id, tradesToExpireForWrongRecipient),
      columns: {
        id: true,
        initiatorUserId: true,
        recipientUserId: true,
        tradePostId: true,
        matchedTradePostId: true,
      },
    });

    const cancelledWr = await db
      .update(activeTrade)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          inArray(activeTrade.id, tradesToExpireForWrongRecipient),
          inArray(activeTrade.status, ["accepted", "partial"]),
        ),
      )
      .returning({ id: activeTrade.id });
    cancelledTradeIds.push(...cancelledWr.map((t) => t.id));
    const cancelledWrIds = new Set(cancelledWr.map((t) => t.id));
    const expiredWr = wrongRecipientTrades.filter((t) =>
      cancelledWrIds.has(t.id),
    );

    const wrPostIds = expiredWr
      .flatMap((t) => [t.tradePostId, t.matchedTradePostId])
      .filter((id): id is string => id !== null);
    if (wrPostIds.length > 0) {
      await db
        .update(tradePost)
        .set({ status: "open", updatedAt: now })
        .where(inArray(tradePost.id, wrPostIds));
    }

    const wrNotifications = expiredWr.flatMap((t) => [
      {
        userId: t.initiatorUserId,
        message: `This trade was cancelled because a misrouted transfer was not recovered within 7 days.`,
      },
      {
        userId: t.recipientUserId,
        message: `This trade was cancelled because a misrouted transfer was not recovered within 7 days.`,
      },
    ]);
    if (wrNotifications.length > 0) await notify(wrNotifications);

    // Issue bans to users who sent to the wrong recipient and it wasn't recovered
    for (const t of expiredWr) {
      // Find the wrong_recipient logs for this trade that aren't recovered
      const tradeWrongLogs = wrongRecipientLogs.filter(
        (l) => l.activeTradeId === t.id,
      );
      const recoveredForTrade = await db.query.tradeTransferLog.findMany({
        where: and(
          eq(tradeTransferLog.activeTradeId, t.id),
          eq(tradeTransferLog.event, "recovered"),
        ),
      });
      const recoveredObjIds = new Set(recoveredForTrade.map((l) => l.objektId));
      const defaultedSenderIds = [
        ...new Set(
          tradeWrongLogs
            .filter((l) => !recoveredObjIds.has(l.objektId))
            .map((l) => l.senderUserId),
        ),
      ];
      for (const userId of defaultedSenderIds) {
        const cosmo = await db.query.cosmoAccount.findFirst({
          where: eq(cosmoAccount.userId, userId),
          columns: { cosmoId: true, address: true },
        });
        const cosmoId = cosmo?.cosmoId?.toString() ?? cosmo?.address ?? userId;
        await issueBan(
          userId,
          cosmoId,
          t.id,
          `Defaulted on Active Trade #${t.id} (misrouted transfer not recovered within 7 days).`,
        );
      }
    }
  }

  // Propagate chain resolution for the trades this run actually cancelled.
  await Promise.all(cancelledTradeIds.map((id) => propagateResolution(id)));

  return NextResponse.json({
    expiredPosts: expiredPosts.length,
    expiredTrades: expiredTrades.length,
    expiredCounterOffers: expiredCounterOffers.length,
    expiredAcceptedTrades: staleAcceptedTrades.length,
    expiredWrongRecipientTrades: tradesToExpireForWrongRecipient.length,
    // What the run read is above; this is what it changed. They differ when
    // another request reached a trade first, which is the case worth seeing.
    cancelled: cancelledTradeIds.length,
  });
}
