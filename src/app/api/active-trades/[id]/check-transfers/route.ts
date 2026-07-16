export const dynamic = "force-dynamic";

import { and, eq, gte, inArray, ne, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
// Stays on the remote indexer, never the mirror — this route reads the
// `transfer` feed for live trade verification, which the mirror doesn't
// carry and which needs freshness the mirror can't guarantee. See Part 2
// plan, Phase 6.
import { indexer } from "@/lib/db/indexer";
import { collections, transfers } from "@/lib/db/indexer-schema";
import {
  activeTrade,
  activeTradeSide,
  tradeNotification,
  tradePost,
  tradeTransferLog,
} from "@/lib/db/schema";
import { notify } from "@/lib/notify";
import { publishTradeEvent } from "@/lib/realtime";
import { redis } from "@/lib/redis";
import { propagateResolution, tryLiftBan } from "@/lib/trade-guards";
import {
  type CollectionTransferEvent,
  fetchCollectionTransferEvents,
  fetchSerials,
  pickTransferForSide,
} from "@/lib/trade-transfer-matching";

type ActiveTradeSideRow = typeof activeTradeSide.$inferSelect;

// POST /api/active-trades/[id]/check-transfers
// Queries the indexer for current objekt ownership and updates side statuses.
// Works for both pending and accepted/partial trades.
//
// Matching is done by (fromAddress, toAddress, collection) rather than the
// pinned objektId a side was created with — the indexer's serial data is
// unreliable, so any objekt of the right collection sent between the right
// two wallets satisfies a side. The specific copy that ends up satisfying a
// side is recorded on activeTradeSide.actualObjektId/actualSerial.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tradeId } = await params;

  // Fetch trade and existing logs in parallel
  const [trade, existingLogs] = await Promise.all([
    db.query.activeTrade.findFirst({
      where: eq(activeTrade.id, tradeId),
      with: { sides: true },
    }),
    db.query.tradeTransferLog.findMany({
      where: eq(tradeTransferLog.activeTradeId, tradeId),
    }),
  ]);

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (
    trade.initiatorUserId !== session.user.id &&
    trade.recipientUserId !== session.user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["pending", "accepted", "partial"].includes(trade.status)) {
    return NextResponse.json({ status: trade.status, sides: trade.sides });
  }

  // Server-side cooldown so this can't be hammered past the client's own
  // throttle — the indexer queries below are the heaviest in the app.
  // Fails open (proceeds with the check) if Redis is unavailable.
  const cooldownKey = `check-transfers-cooldown:${tradeId}`;
  try {
    const set = await redis.set(cooldownKey, "1", "EX", 8, "NX");
    if (set === null) {
      return NextResponse.json({
        status: trade.status,
        sides: trade.sides,
        skipped: true,
        updated: 0,
      });
    }
  } catch {
    // Redis unavailable — proceed without the cooldown
  }

  const loggedEvents = new Set(
    existingLogs.map((l) => `${l.activeTradeSideId}:${l.event}`),
  );

  let updatedCount = 0;

  if (trade.status === "pending") {
    // ── PENDING: detect pre-accept transfers, matched by collection ──
    const collectionSlugs = [
      ...new Set(trade.sides.map((s) => s.collectionId)),
    ];
    const addresses = [
      ...new Set(
        trade.sides.flatMap((s) => [
          s.address.toLowerCase(),
          s.recipientAddress.toLowerCase(),
        ]),
      ),
    ];
    const transferEvents = await fetchCollectionTransferEvents({
      collectionSlugs,
      addresses,
      since: trade.createdAt,
    });

    // Objekts already bound to a side (from this or a previous poll) can't be
    // claimed again by another side of the same collection.
    const claimedObjektIds = new Set(
      trade.sides
        .map((s) => s.actualObjektId)
        .filter((id): id is string => id !== null),
    );

    const newlyMatched: {
      side: ActiveTradeSideRow;
      transfer: CollectionTransferEvent;
    }[] = [];
    for (const side of trade.sides) {
      if (side.actualObjektId) continue; // already bound from a previous poll
      const matched = pickTransferForSide(transferEvents, {
        from: side.address,
        to: side.recipientAddress,
        collectionSlug: side.collectionId,
        excludeObjektIds: claimedObjektIds,
      });
      if (!matched) continue;
      claimedObjektIds.add(matched.objektId);
      newlyMatched.push({ side, transfer: matched });
    }

    const serialMap = await fetchSerials(
      newlyMatched.map((m) => m.transfer.objektId),
    );
    const matchedBySideId = new Map(
      newlyMatched.map(({ side, transfer }) => [
        side.id,
        {
          objektId: transfer.objektId,
          serial: serialMap.get(transfer.objektId) ?? null,
        },
      ]),
    );

    const pendingInserts: (typeof tradeTransferLog.$inferInsert)[] = [];
    for (const { side, transfer } of newlyMatched) {
      const recipientUserId =
        side.userId === trade.initiatorUserId
          ? trade.recipientUserId
          : trade.initiatorUserId;
      const serial = serialMap.get(transfer.objektId) ?? null;

      for (const event of [
        "pre_accept_sent",
        "pre_accept_confirmed",
      ] as const) {
        pendingInserts.push({
          activeTradeId: tradeId,
          activeTradeSideId: side.id,
          fromAddress: transfer.from,
          toAddress: transfer.to,
          objektId: transfer.objektId,
          collectionId: side.collectionId,
          collectionNo: side.collectionNo,
          member: side.member,
          serial,
          senderUserId: side.userId,
          recipientUserId,
          event,
        });
      }
      loggedEvents.add(`${side.id}:pre_accept_sent`);
      loggedEvents.add(`${side.id}:pre_accept_confirmed`);
      updatedCount++;
    }

    if (newlyMatched.length > 0) {
      await Promise.all([
        pendingInserts.length > 0
          ? db.insert(tradeTransferLog).values(pendingInserts)
          : Promise.resolve(),
        ...newlyMatched.map(({ side, transfer }) =>
          db
            .update(activeTradeSide)
            .set({
              actualObjektId: transfer.objektId,
              actualSerial: serialMap.get(transfer.objektId) ?? null,
            })
            .where(eq(activeTradeSide.id, side.id)),
        ),
      ]);
    }

    // ── AUTO-ACCEPT: if ALL sides for a party are now pre_accept_sent, promote the trade ──
    const initiatorSides = trade.sides.filter(
      (s) => s.userId === trade.initiatorUserId,
    );
    const recipientSidesForCheck = trade.sides.filter(
      (s) => s.userId === trade.recipientUserId,
    );

    const isPreSent = (s: ActiveTradeSideRow) =>
      loggedEvents.has(`${s.id}:pre_accept_sent`);
    const initiatorAllPreSent = initiatorSides.every(isPreSent);
    const recipientAllPreSent = recipientSidesForCheck.every(isPreSent);

    const resolveActual = (side: ActiveTradeSideRow) =>
      matchedBySideId.get(side.id) ??
      (side.actualObjektId
        ? { objektId: side.actualObjektId, serial: side.actualSerial }
        : null);

    if (initiatorAllPreSent && recipientAllPreSent) {
      // Both parties sent everything pre-accept — promote straight to completed
      const now = new Date();
      await db.transaction(async (tx) => {
        for (const side of trade.sides) {
          const actual = resolveActual(side);
          await tx
            .update(activeTradeSide)
            .set({
              status: "confirmed",
              detectedAt: now,
              ...(actual
                ? {
                    actualObjektId: actual.objektId,
                    actualSerial: actual.serial,
                  }
                : {}),
            })
            .where(eq(activeTradeSide.id, side.id));
        }

        await tx
          .update(activeTrade)
          .set({ status: "completed", acceptedAt: now, updatedAt: now })
          .where(
            and(eq(activeTrade.id, tradeId), eq(activeTrade.status, "pending")),
          );

        const postIds = [trade.tradePostId, trade.matchedTradePostId].filter(
          (id): id is string => id !== null,
        );
        if (postIds.length > 0) {
          await tx
            .update(tradePost)
            .set({ status: "closed", updatedAt: now })
            .where(inArray(tradePost.id, postIds));
        }
      });
      await notify([
        {
          userId: trade.initiatorUserId,
          message: `This trade is complete! Both parties had already sent their objekts.`,
        },
        {
          userId: trade.recipientUserId,
          message: `This trade is complete! Both parties had already sent their objekts.`,
        },
      ]);
    } else if (recipientAllPreSent) {
      // Recipient sent all their objekts pre-accept — auto-promote to accepted
      const now = new Date();
      await db.transaction(async (tx) => {
        // Mark recipient's sides as confirmed (they already arrived)
        for (const side of recipientSidesForCheck) {
          const actual = resolveActual(side);
          await tx
            .update(activeTradeSide)
            .set({
              status: "confirmed",
              detectedAt: now,
              ...(actual
                ? {
                    actualObjektId: actual.objektId,
                    actualSerial: actual.serial,
                  }
                : {}),
            })
            .where(eq(activeTradeSide.id, side.id));
        }

        await tx
          .update(activeTrade)
          .set({ status: "accepted", acceptedAt: now, updatedAt: now })
          .where(
            and(eq(activeTrade.id, tradeId), eq(activeTrade.status, "pending")),
          );

        const postIds = [trade.tradePostId, trade.matchedTradePostId].filter(
          (id): id is string => id !== null,
        );
        if (postIds.length > 0) {
          await tx
            .update(tradePost)
            .set({ status: "in_trade", updatedAt: now })
            .where(inArray(tradePost.id, postIds));
        }
      });
      await notify([
        {
          userId: trade.initiatorUserId,
          message: `The other party has already sent all their objekts. Please send yours to complete the trade.`,
        },
        {
          userId: trade.recipientUserId,
          message: `This trade has been automatically accepted because you sent all your objekts. Waiting for the other party to send theirs.`,
        },
      ]);
    } else if (initiatorAllPreSent) {
      // Initiator sent all pre-accept — notify recipient once (they can still cancel or accept)
      const notifMsg = `The other party has already sent all their objekts before you accepted. You can accept as normal, or cancel — if you cancel, please return the objekts to them.`;
      // Only query notifications if we actually need to dedup this message
      const existingNotifs = await db.query.tradeNotification.findMany({
        where: and(
          inArray(tradeNotification.userId, [trade.recipientUserId]),
          eq(tradeNotification.activeTradeId, tradeId),
        ),
      });
      const notifMessages = new Set(existingNotifs.map((n) => n.message));
      if (!notifMessages.has(notifMsg)) {
        await notify({
          userId: trade.recipientUserId,
          message: notifMsg,
        });
      }
    }
  } else {
    // ── ACCEPTED / PARTIAL: normal transfer tracking, matched by collection ──
    const pendingSides = trade.sides.filter((s) => s.status !== "confirmed");

    if (pendingSides.length > 0) {
      const transferSince = trade.acceptedAt ?? trade.createdAt;
      const collectionSlugs = [
        ...new Set(pendingSides.map((s) => s.collectionId)),
      ];
      const addresses = [
        ...new Set(
          trade.sides.flatMap((s) => [
            s.address.toLowerCase(),
            s.recipientAddress.toLowerCase(),
          ]),
        ),
      ];
      const transferEvents = await fetchCollectionTransferEvents({
        collectionSlugs,
        addresses,
        since: transferSince,
      });

      // Objekts already bound to any side in this trade (confirmed earlier, or
      // bound to another pending side in an earlier poll) can't be reclaimed.
      const claimedObjektIds = new Set(
        trade.sides
          .map((s) => s.actualObjektId)
          .filter((id): id is string => id !== null),
      );

      const sideInserts: (typeof tradeTransferLog.$inferInsert)[] = [];
      const sideUpdates: {
        id: number;
        status: "sent" | "confirmed";
        detectedAt?: Date;
        actualObjektId?: string;
      }[] = [];

      for (const side of pendingSides) {
        const recipientUserId =
          side.userId === trade.initiatorUserId
            ? trade.recipientUserId
            : trade.initiatorUserId;

        let confirmedTransfer: CollectionTransferEvent | undefined;
        if (side.actualObjektId) {
          // Already bound to a specific copy from an earlier poll — only look
          // for that exact objekt now, so status can progress sent -> confirmed.
          confirmedTransfer = transferEvents.find(
            (t) =>
              t.objektId === side.actualObjektId &&
              t.from.toLowerCase() === side.address.toLowerCase() &&
              t.to.toLowerCase() === side.recipientAddress.toLowerCase(),
          );
        } else {
          confirmedTransfer = pickTransferForSide(transferEvents, {
            from: side.address,
            to: side.recipientAddress,
            collectionSlug: side.collectionId,
            excludeObjektIds: claimedObjektIds,
          });
          if (confirmedTransfer)
            claimedObjektIds.add(confirmedTransfer.objektId);
        }

        const wrongRecipientTransfer = !confirmedTransfer
          ? transferEvents.find(
              (t) =>
                t.collectionSlug === side.collectionId &&
                t.from.toLowerCase() === side.address.toLowerCase() &&
                t.to.toLowerCase() !== side.recipientAddress.toLowerCase() &&
                !claimedObjektIds.has(t.objektId),
            )
          : undefined;

        if (confirmedTransfer) {
          if (side.status === "pending") {
            sideUpdates.push({
              id: side.id,
              status: "sent",
              actualObjektId: confirmedTransfer.objektId,
            });
            sideInserts.push({
              activeTradeId: tradeId,
              activeTradeSideId: side.id,
              fromAddress: confirmedTransfer.from,
              toAddress: confirmedTransfer.to,
              objektId: confirmedTransfer.objektId,
              collectionId: side.collectionId,
              collectionNo: side.collectionNo,
              member: side.member,
              serial: null,
              senderUserId: side.userId,
              recipientUserId,
              event: "sent",
            });
            updatedCount++;
          } else if (side.status === "sent") {
            sideUpdates.push({
              id: side.id,
              status: "confirmed",
              detectedAt: new Date(),
              actualObjektId: confirmedTransfer.objektId,
            });
            sideInserts.push({
              activeTradeId: tradeId,
              activeTradeSideId: side.id,
              fromAddress: confirmedTransfer.from,
              toAddress: confirmedTransfer.to,
              objektId: confirmedTransfer.objektId,
              collectionId: side.collectionId,
              collectionNo: side.collectionNo,
              member: side.member,
              serial: null,
              senderUserId: side.userId,
              recipientUserId,
              event: "confirmed",
            });
            updatedCount++;
          }
        } else if (
          wrongRecipientTransfer &&
          !loggedEvents.has(`${side.id}:wrong_recipient`)
        ) {
          claimedObjektIds.add(wrongRecipientTransfer.objektId);
          sideInserts.push({
            activeTradeId: tradeId,
            activeTradeSideId: side.id,
            fromAddress: side.address,
            toAddress: wrongRecipientTransfer.to,
            objektId: wrongRecipientTransfer.objektId,
            collectionId: side.collectionId,
            collectionNo: side.collectionNo,
            member: side.member,
            serial: null,
            senderUserId: side.userId,
            recipientUserId,
            event: "wrong_recipient",
          });
          loggedEvents.add(`${side.id}:wrong_recipient`);
          updatedCount++;
        }

        // ── RECOVERY: after wrong_recipient, check if the objekt reached the
        // intended recipient via a third party (scenario 1: user3 → user2)
        // or via the original sender getting it back (scenario 2: user3 → user1 → user2,
        // where the second leg is already handled by confirmedTransfer above).
        // This block only fires when there's no direct confirmedTransfer from the
        // original sender and a wrong_recipient was previously logged.
        if (
          !confirmedTransfer &&
          loggedEvents.has(`${side.id}:wrong_recipient`) &&
          !loggedEvents.has(`${side.id}:recovered`)
        ) {
          const recoveryTransfer = transferEvents.find(
            (t) =>
              t.collectionSlug === side.collectionId &&
              t.to.toLowerCase() === side.recipientAddress.toLowerCase() &&
              t.from.toLowerCase() !== side.address.toLowerCase() &&
              !claimedObjektIds.has(t.objektId),
          );
          if (recoveryTransfer) {
            claimedObjektIds.add(recoveryTransfer.objektId);
            sideInserts.push({
              activeTradeId: tradeId,
              activeTradeSideId: side.id,
              fromAddress: recoveryTransfer.from,
              toAddress: recoveryTransfer.to,
              objektId: recoveryTransfer.objektId,
              collectionId: side.collectionId,
              collectionNo: side.collectionNo,
              member: side.member,
              serial: null,
              senderUserId: side.userId,
              recipientUserId,
              event: "recovered",
            });
            loggedEvents.add(`${side.id}:recovered`);
            sideUpdates.push({
              id: side.id,
              status: "confirmed",
              detectedAt: new Date(),
              actualObjektId: recoveryTransfer.objektId,
            });
            updatedCount++;
          }
        }
      }

      // Batch-resolve serials for every objekt referenced in this pass, then
      // fill them into the insert rows (placeholder null above).
      const serialMap = await fetchSerials(sideInserts.map((i) => i.objektId));
      for (const insert of sideInserts) {
        insert.serial = serialMap.get(insert.objektId) ?? null;
      }

      // Flush all inserts and updates in parallel
      await Promise.all([
        sideInserts.length > 0
          ? db.insert(tradeTransferLog).values(sideInserts)
          : Promise.resolve(),
        ...sideUpdates.map((u) =>
          db
            .update(activeTradeSide)
            .set({
              status: u.status,
              ...(u.detectedAt ? { detectedAt: u.detectedAt } : {}),
              ...(u.actualObjektId
                ? {
                    actualObjektId: u.actualObjektId,
                    actualSerial: serialMap.get(u.actualObjektId) ?? null,
                  }
                : {}),
            })
            .where(eq(activeTradeSide.id, u.id)),
        ),
      ]);
    }
  }

  // ── RETURN DETECTION ──
  // A return is when the recipient of a confirmed side sends that same objekt
  // back to the original sender. Detected on accepted/partial trades only.
  // When all confirmed sides that were received by a user have been returned,
  // either party can cancel the trade without penalty. Uses the actual objekt
  // that was confirmed for the side (not the originally pinned one).
  if (["accepted", "partial"].includes(trade.status)) {
    const confirmedSides = trade.sides.filter((s) => s.status === "confirmed");

    if (confirmedSides.length > 0) {
      const trackedObjektIdBySide = new Map(
        confirmedSides.map((s) => [s.id, s.actualObjektId ?? s.objektId]),
      );
      const confirmedObjektIds = [...trackedObjektIdBySide.values()];
      const transferSince = trade.acceptedAt ?? trade.createdAt;

      // Query the indexer for any transfers of the confirmed objekt IDs since acceptance
      const returnCandidates = await indexer
        .select({
          objektId: transfers.objektId,
          from: transfers.from,
          to: transfers.to,
          timestamp: transfers.timestamp,
        })
        .from(transfers)
        .where(
          and(
            inArray(transfers.objektId, confirmedObjektIds),
            transferSince ? gte(transfers.timestamp, transferSince) : undefined,
          ),
        );

      // Collect return inserts to batch
      const returnInserts: (typeof tradeTransferLog.$inferInsert)[] = [];
      const returnNotifications: {
        userId: string;
        activeTradeId: string;
        message: string;
      }[] = [];

      // Build dedup set for return notifications once, not per-side
      let existingReturnMsgs: Set<string> | null = null;

      for (const side of confirmedSides) {
        const trackedObjektId =
          trackedObjektIdBySide.get(side.id) ??
          side.actualObjektId ??
          side.objektId;
        // A return: the objekt that was sent FROM side.address TO side.recipientAddress
        // is now being sent back FROM side.recipientAddress TO side.address
        const returnTransfer = returnCandidates.find(
          (t) =>
            t.objektId === trackedObjektId &&
            t.from.toLowerCase() === side.recipientAddress.toLowerCase() &&
            t.to.toLowerCase() === side.address.toLowerCase(),
        );

        if (returnTransfer && !loggedEvents.has(`${side.id}:returned`)) {
          const recipientUserId =
            side.userId === trade.initiatorUserId
              ? trade.recipientUserId
              : trade.initiatorUserId;

          returnInserts.push({
            activeTradeId: tradeId,
            activeTradeSideId: side.id,
            fromAddress: side.recipientAddress,
            toAddress: side.address,
            objektId: trackedObjektId,
            collectionId: side.collectionId,
            collectionNo: side.collectionNo,
            member: side.member,
            serial: side.actualSerial ?? side.serial,
            // sender of the return = the recipient of the original transfer
            senderUserId: recipientUserId,
            recipientUserId: side.userId,
            event: "returned",
          });
          loggedEvents.add(`${side.id}:returned`);
          updatedCount++;

          const senderName =
            recipientUserId === trade.initiatorUserId
              ? ((trade as typeof trade & { initiator?: { name: string } })
                  .initiator?.name ?? "Your partner")
              : ((trade as typeof trade & { recipient?: { name: string } })
                  .recipient?.name ?? "Your partner");
          const objektLabel =
            side.collectionNo && side.member
              ? `${side.member} ${side.collectionNo}`
              : side.collectionId;

          const returnNotifMsg = `${senderName} returned ${objektLabel}. Either party can now cancel this trade without penalty.`;

          // Lazy-load existing return notification messages once
          if (existingReturnMsgs === null) {
            const existingReturnNotifs =
              await db.query.tradeNotification.findMany({
                where: and(
                  inArray(tradeNotification.userId, [
                    trade.initiatorUserId,
                    trade.recipientUserId,
                  ]),
                  eq(tradeNotification.activeTradeId, tradeId),
                ),
              });
            existingReturnMsgs = new Set(
              existingReturnNotifs.map((n) => n.message),
            );
          }

          if (!existingReturnMsgs.has(returnNotifMsg)) {
            returnNotifications.push(
              {
                userId: trade.initiatorUserId,
                activeTradeId: tradeId,
                message: returnNotifMsg,
              },
              {
                userId: trade.recipientUserId,
                activeTradeId: tradeId,
                message: returnNotifMsg,
              },
            );
            existingReturnMsgs.add(returnNotifMsg);
          }
        }
      }

      // Flush return inserts and notifications in parallel
      await Promise.all([
        returnInserts.length > 0
          ? db.insert(tradeTransferLog).values(returnInserts)
          : Promise.resolve(),
        returnNotifications.length > 0
          ? notify(returnNotifications)
          : Promise.resolve(),
      ]);
    }
  }

  // ── WRONG OBJEKT DETECTION ──
  // Only run for accepted/partial trades. On pending trades the parties' wallets
  // may have unrelated transfers (old or other active trades) that would be
  // falsely flagged here. A transfer is "wrong" only if its (from, to,
  // collection) triple isn't one this trade expects at all — sending extra
  // copies or a different serial of an expected collection is never flagged.
  if (!["accepted", "partial"].includes(trade.status)) {
    if (updatedCount > 0) {
      void publishTradeEvent(tradeId, "trade:transfer-detected", {
        activeTradeId: tradeId,
        count: updatedCount,
      });
    }

    // If nothing changed, skip the DB reloads and reconstruct from what we have
    if (updatedCount === 0) {
      const preAcceptCount = existingLogs.filter(
        (l) =>
          l.event === "pre_accept_sent" || l.event === "pre_accept_confirmed",
      ).length;
      return NextResponse.json({
        status: trade.status,
        updated: 0,
        sides: trade.sides,
        preAcceptTransfers: preAcceptCount,
        wrongObjektTransfers: 0,
        wrongRecipientTransfers: 0,
        recoveredTransfers: 0,
        suspiciousTransfers: 0,
      });
    }

    const [freshLogsEarly, freshSidesEarly] = await Promise.all([
      db.query.tradeTransferLog.findMany({
        where: eq(tradeTransferLog.activeTradeId, tradeId),
      }),
      db.query.activeTradeSide.findMany({
        where: eq(activeTradeSide.activeTradeId, tradeId),
      }),
    ]);
    const preAcceptLogsEarly = freshLogsEarly.filter(
      (l) =>
        l.event === "pre_accept_sent" || l.event === "pre_accept_confirmed",
    );
    return NextResponse.json({
      status: trade.status,
      updated: updatedCount,
      sides: freshSidesEarly,
      preAcceptTransfers: preAcceptLogsEarly.length,
      wrongObjektTransfers: 0,
      wrongRecipientTransfers: 0,
      recoveredTransfers: 0,
      suspiciousTransfers: 0,
    });
  }

  // Query the indexer's transfer table for actual transfers between trade parties
  // since the trade was accepted, then flag any transfer whose (from, to,
  // collection) triple isn't expected by this trade at all.

  const expectedTriples = new Set(
    trade.sides.map(
      (s) =>
        `${s.address.toLowerCase()}>${s.recipientAddress.toLowerCase()}>${s.collectionId}`,
    ),
  );

  // Sending addresses for each party (side.address = sender's wallet)
  const initiatorSendAddrs = trade.sides
    .filter((s) => s.userId === trade.initiatorUserId)
    .map((s) => s.address.toLowerCase());
  const recipientSendAddrs = trade.sides
    .filter((s) => s.userId === trade.recipientUserId)
    .map((s) => s.address.toLowerCase());
  // Receiving addresses for each party (side.recipientAddress = receiver's wallet)
  const recipientRecvAddrs = trade.sides
    .filter((s) => s.userId === trade.initiatorUserId)
    .map((s) => s.recipientAddress.toLowerCase());
  const initiatorRecvAddrs = trade.sides
    .filter((s) => s.userId === trade.recipientUserId)
    .map((s) => s.recipientAddress.toLowerCase());

  // from = any sender address, to = any receiver address
  const uniqueFromAddresses = [
    ...new Set([...initiatorSendAddrs, ...recipientSendAddrs]),
  ];
  const uniqueToAddresses = [
    ...new Set([...recipientRecvAddrs, ...initiatorRecvAddrs]),
  ];
  const tradeStartAt = trade.acceptedAt ?? trade.createdAt;

  // Query actual transfers between the parties from the indexer transfer table
  const recentTransfers = await indexer
    .select({
      id: transfers.id,
      from: transfers.from,
      to: transfers.to,
      objektId: transfers.objektId,
      collectionId: transfers.collectionId,
      timestamp: transfers.timestamp,
    })
    .from(transfers)
    .where(
      and(
        inArray(transfers.from, uniqueFromAddresses),
        inArray(transfers.to, uniqueToAddresses),
        // Only check transfers after the trade was accepted (or created as fallback)
        tradeStartAt ? gte(transfers.timestamp, tradeStartAt) : undefined,
      ),
    );

  // Resolve collection slugs for the transferred collections so we can check
  // triple membership.
  const transferCollectionUuids = [
    ...new Set(
      recentTransfers
        .map((t) => t.collectionId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const collRows =
    transferCollectionUuids.length > 0
      ? await indexer
          .select({
            id: collections.id,
            collectionId: collections.collectionId,
            collectionNo: collections.collectionNo,
            member: collections.member,
          })
          .from(collections)
          .where(inArray(collections.id, transferCollectionUuids))
      : [];
  const collByUuid = new Map(collRows.map((c) => [c.id, c]));

  // Filter to transfers whose (from, to, collection) triple this trade doesn't expect
  const wrongTransfers = recentTransfers.filter((t) => {
    if (!t.objektId || !t.collectionId) return false;
    const coll = collByUuid.get(t.collectionId);
    if (!coll) return true; // unresolvable collection — flag to be safe
    const triple = `${t.from.toLowerCase()}>${t.to.toLowerCase()}>${coll.collectionId}`;
    return !expectedTriples.has(triple);
  });

  const MAX_WRONG_TRANSFERS_PER_TRADE = 10;

  if (wrongTransfers.length > 0) {
    // Check how many wrong_objekt logs already exist for this trade
    const existingWrongCount = existingLogs.filter(
      (l) => l.event === "wrong_objekt",
    ).length;

    if (existingWrongCount < MAX_WRONG_TRANSFERS_PER_TRADE) {
      const remainingSlots = MAX_WRONG_TRANSFERS_PER_TRADE - existingWrongCount;

      const wrongObjektIds = wrongTransfers
        .map((t) => t.objektId)
        .filter((id): id is string => id !== null);
      const serialMap = await fetchSerials(wrongObjektIds);

      const wrongInserts: (typeof tradeTransferLog.$inferInsert)[] = [];
      let insertedWrongCount = 0;
      for (const t of wrongTransfers) {
        if (insertedWrongCount >= remainingSlots) break;
        if (!t.objektId) continue;
        if (loggedEvents.has(`${t.objektId}:wrong_objekt`)) continue;

        const fromLower = t.from.toLowerCase();
        const isFromInitiator = initiatorSendAddrs.includes(fromLower);
        const senderUserId = isFromInitiator
          ? trade.initiatorUserId
          : trade.recipientUserId;
        const recipientUserId = isFromInitiator
          ? trade.recipientUserId
          : trade.initiatorUserId;

        const coll = t.collectionId ? collByUuid.get(t.collectionId) : null;

        wrongInserts.push({
          activeTradeId: tradeId,
          activeTradeSideId: null,
          fromAddress: t.from,
          toAddress: t.to,
          objektId: t.objektId,
          collectionId: coll?.collectionId ?? t.collectionId ?? "unknown",
          collectionNo: coll?.collectionNo ?? null,
          member: coll?.member ?? null,
          serial: serialMap.get(t.objektId) ?? null,
          senderUserId,
          recipientUserId,
          event: "wrong_objekt",
        });
        insertedWrongCount++;
        updatedCount++;
      }

      if (wrongInserts.length > 0) {
        await db.insert(tradeTransferLog).values(wrongInserts);
      }
    }
  }

  // Reload sides and logs in parallel — skip if nothing changed
  let freshSides = trade.sides;
  let freshLogs = existingLogs;
  if (updatedCount > 0) {
    [freshSides, freshLogs] = (await Promise.all([
      db.query.activeTradeSide.findMany({
        where: eq(activeTradeSide.activeTradeId, tradeId),
      }),
      db.query.tradeTransferLog.findMany({
        where: eq(tradeTransferLog.activeTradeId, tradeId),
      }),
    ])) as [typeof freshSides, typeof freshLogs];
  }

  // Update overall trade status (only for accepted/partial)
  let newTradeStatus = trade.status;
  if (["accepted", "partial"].includes(trade.status)) {
    const allConfirmed = freshSides.every((s) => s.status === "confirmed");
    const anyConfirmed = freshSides.some((s) => s.status === "confirmed");

    if (allConfirmed) {
      newTradeStatus = "completed";
    } else if (anyConfirmed) {
      newTradeStatus = "partial";
    }

    if (newTradeStatus !== trade.status) {
      await db
        .update(activeTrade)
        .set({ status: newTradeStatus, updatedAt: new Date() })
        .where(eq(activeTrade.id, tradeId));

      if (newTradeStatus === "completed") {
        await notify([
          {
            userId: trade.initiatorUserId,
            message: `This trade is complete! Objekts from both sides have been transferred.`,
          },
          {
            userId: trade.recipientUserId,
            message: `This trade is complete! Objekts from both sides have been transferred.`,
          },
        ]);

        // Close both trade posts permanently
        const postIds = [trade.tradePostId, trade.matchedTradePostId].filter(
          (id): id is string => id !== null,
        );
        if (postIds.length > 0) {
          await db
            .update(tradePost)
            .set({ status: "closed", updatedAt: new Date() })
            .where(inArray(tradePost.id, postIds));
        }

        // Cancel all other pending/accepted active trades that involve either of these posts
        if (postIds.length > 0) {
          const siblingTrades = await db.query.activeTrade.findMany({
            where: and(
              ne(activeTrade.id, tradeId),
              inArray(activeTrade.status, ["pending", "accepted", "partial"]),
              or(
                ...postIds.flatMap((pid) => [
                  eq(activeTrade.tradePostId, pid),
                  eq(activeTrade.matchedTradePostId, pid),
                ]),
              ),
            ),
            columns: { id: true, initiatorUserId: true, recipientUserId: true },
          });

          if (siblingTrades.length > 0) {
            const siblingIds = siblingTrades.map((t) => t.id);
            await db
              .update(activeTrade)
              .set({ status: "cancelled", updatedAt: new Date() })
              .where(inArray(activeTrade.id, siblingIds));

            const notifications = siblingTrades.flatMap((t) => [
              {
                userId: t.initiatorUserId,
                message: `This trade was cancelled because another trade completed first.`,
              },
              {
                userId: t.recipientUserId,
                message: `This trade was cancelled because another trade completed first.`,
              },
            ]);
            await notify(notifications);
          }
        }
      }
    }
  }

  // Auto-lift bans and propagate chain resolution if trade completed
  if (newTradeStatus === "completed") {
    await Promise.all([
      tryLiftBan(trade.initiatorUserId, tradeId),
      tryLiftBan(trade.recipientUserId, tradeId),
      propagateResolution(tradeId),
    ]);
  }

  // Realtime: notify participants of transfer updates
  if (updatedCount > 0) {
    const event =
      newTradeStatus === "completed"
        ? "trade:completed"
        : "trade:transfer-detected";
    void publishTradeEvent(tradeId, event, {
      activeTradeId: tradeId,
      count: updatedCount,
    });
  }

  const preAcceptLogs = freshLogs.filter(
    (l) => l.event === "pre_accept_sent" || l.event === "pre_accept_confirmed",
  );
  const wrongObjektLogs = freshLogs.filter((l) => l.event === "wrong_objekt");
  const wrongRecipientLogs = freshLogs.filter(
    (l) => l.event === "wrong_recipient",
  );
  const recoveredLogs = freshLogs.filter((l) => l.event === "recovered");
  const returnedLogs = freshLogs.filter((l) => l.event === "returned");

  // wrong_recipient logs that have a matching recovered log (same side) are no longer suspicious
  const recoveredSideIds = new Set(
    recoveredLogs.map((l) => l.activeTradeSideId),
  );
  const unresolvedWrongRecipientLogs = wrongRecipientLogs.filter(
    (l) => !recoveredSideIds.has(l.activeTradeSideId),
  );

  // A user has "fully returned" if every confirmed side they received has a matching returned log
  const returnedSideIds = new Set(returnedLogs.map((l) => l.activeTradeSideId));

  return NextResponse.json({
    status: newTradeStatus,
    updated: updatedCount,
    sides: freshSides,
    preAcceptTransfers: preAcceptLogs.length,
    wrongObjektTransfers: wrongObjektLogs.length,
    wrongRecipientTransfers: wrongRecipientLogs.length,
    recoveredTransfers: recoveredLogs.length,
    returnedTransfers: returnedLogs.length,
    returnedSideIds: [...returnedSideIds],
    suspiciousTransfers:
      wrongObjektLogs.length + unresolvedWrongRecipientLogs.length,
  });
}
