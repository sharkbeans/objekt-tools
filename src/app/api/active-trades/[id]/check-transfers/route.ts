import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { indexer } from "@/lib/db/indexer";
import { activeTrade, activeTradeSide, tradeNotification, tradePost, tradeTransferLog } from "@/lib/db/schema";
import { objekts, collections, transfers } from "@/lib/db/indexer-schema";
import { eq, inArray, and, or, ne, gte } from "drizzle-orm";

// POST /api/active-trades/[id]/check-transfers
// Queries the indexer for current objekt ownership and updates side statuses.
// Works for both pending and accepted/partial trades.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tradeId } = await params;

  const trade = await db.query.activeTrade.findFirst({
    where: eq(activeTrade.id, tradeId),
    with: { sides: true },
  });

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

  // Query indexer for current owners of the traded objekts
  const tradeObjektIds = trade.sides.map((s) => s.objektId);
  const owned = await indexer
    .select({ id: objekts.id, owner: objekts.owner })
    .from(objekts)
    .where(inArray(objekts.id, tradeObjektIds));
  const ownerMap = new Map(owned.map((o) => [o.id, o.owner]));

  // Build a set of objekt IDs that are part of this trade for quick lookup
  const tradeObjektIdSet = new Set(tradeObjektIds);

  // Load existing transfer logs to avoid duplicate logging
  const existingLogs = await db.query.tradeTransferLog.findMany({
    where: eq(tradeTransferLog.activeTradeId, tradeId),
  });
  const loggedEvents = new Set(
    existingLogs.map((l) => `${l.objektId}:${l.event}`)
  );

  let updatedCount = 0;

  if (trade.status === "pending") {
    // ── PENDING: detect pre-accept transfers ──
    for (const side of trade.sides) {
      const currentOwner = ownerMap.get(side.objektId);
      if (!currentOwner) continue;

      // Objekt already arrived at recipient before acceptance
      if (currentOwner.toLowerCase() === side.recipientAddress.toLowerCase()) {
        if (!loggedEvents.has(`${side.objektId}:pre_accept_confirmed`)) {
          const recipientUserId = side.userId === trade.initiatorUserId
            ? trade.recipientUserId
            : trade.initiatorUserId;
          await db.insert(tradeTransferLog).values({
            activeTradeId: tradeId,
            activeTradeSideId: side.id,
            fromAddress: side.address,
            toAddress: side.recipientAddress,
            objektId: side.objektId,
            collectionId: side.collectionId,
            collectionNo: side.collectionNo,
            member: side.member,
            serial: side.serial,
            senderUserId: side.userId,
            recipientUserId,
            event: "pre_accept_confirmed",
          });
          updatedCount++;
        }
      }
      // Objekt left sender but hasn't arrived at recipient yet
      else if (currentOwner.toLowerCase() !== side.address.toLowerCase()) {
        if (!loggedEvents.has(`${side.objektId}:pre_accept_sent`)) {
          const recipientUserId = side.userId === trade.initiatorUserId
            ? trade.recipientUserId
            : trade.initiatorUserId;
          await db.insert(tradeTransferLog).values({
            activeTradeId: tradeId,
            activeTradeSideId: side.id,
            fromAddress: side.address,
            toAddress: side.recipientAddress,
            objektId: side.objektId,
            collectionId: side.collectionId,
            collectionNo: side.collectionNo,
            member: side.member,
            serial: side.serial,
            senderUserId: side.userId,
            recipientUserId,
            event: "pre_accept_sent",
          });
          updatedCount++;
        }
      }
    }
  } else {
    // ── ACCEPTED / PARTIAL: normal transfer tracking ──
    const pendingSides = trade.sides.filter((s) => s.status !== "confirmed");

    for (const side of pendingSides) {
      const currentOwner = ownerMap.get(side.objektId);
      if (!currentOwner) continue;

      if (currentOwner.toLowerCase() === side.recipientAddress.toLowerCase()) {
        // Belt-and-suspenders: skip unsolicited pre-accept transfers
        if (
          side.ownerAtAcceptance &&
          side.ownerAtAcceptance.toLowerCase() === side.recipientAddress.toLowerCase()
        ) {
          continue;
        }

        const recipientUserId = side.userId === trade.initiatorUserId
          ? trade.recipientUserId
          : trade.initiatorUserId;
        await db
          .update(activeTradeSide)
          .set({ status: "confirmed", detectedAt: new Date() })
          .where(eq(activeTradeSide.id, side.id));
        await db.insert(tradeTransferLog).values({
          activeTradeId: tradeId,
          activeTradeSideId: side.id,
          fromAddress: side.address,
          toAddress: side.recipientAddress,
          objektId: side.objektId,
          collectionId: side.collectionId,
          collectionNo: side.collectionNo,
          member: side.member,
          serial: side.serial,
          senderUserId: side.userId,
          recipientUserId,
          event: "confirmed",
        });
        updatedCount++;
      } else if (currentOwner.toLowerCase() !== side.address.toLowerCase() && side.status === "pending") {
        const recipientUserIdForSent = side.userId === trade.initiatorUserId
          ? trade.recipientUserId
          : trade.initiatorUserId;
        await db
          .update(activeTradeSide)
          .set({ status: "sent" })
          .where(eq(activeTradeSide.id, side.id));
        await db.insert(tradeTransferLog).values({
          activeTradeId: tradeId,
          activeTradeSideId: side.id,
          fromAddress: side.address,
          toAddress: side.recipientAddress,
          objektId: side.objektId,
          collectionId: side.collectionId,
          collectionNo: side.collectionNo,
          member: side.member,
          serial: side.serial,
          senderUserId: side.userId,
          recipientUserId: recipientUserIdForSent,
          event: "sent",
        });
        updatedCount++;
      }
    }
  }

  // ── WRONG OBJEKT DETECTION ──
  // Query the indexer's transfer table for actual transfers between trade parties
  // since the trade was created, then flag any non-trade objekts

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
  const uniqueFromAddresses = [...new Set([...initiatorSendAddrs, ...recipientSendAddrs])];
  const uniqueToAddresses = [...new Set([...recipientRecvAddrs, ...initiatorRecvAddrs])];

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
        // Only check transfers after the trade was created
        trade.createdAt
          ? gte(transfers.timestamp, trade.createdAt)
          : undefined,
      )
    );

  // Filter to non-trade objekts only
  const wrongTransfers = recentTransfers.filter(
    (t) => t.objektId && !tradeObjektIdSet.has(t.objektId)
  );

  if (wrongTransfers.length > 0) {
    // Get objekt details (serial) and collection details for display
    const wrongObjektIds = wrongTransfers
      .map((t) => t.objektId)
      .filter((id): id is string => id !== null);
    const wrongCollectionIds = wrongTransfers
      .map((t) => t.collectionId)
      .filter((id): id is string => id !== null);

    let serialMap = new Map<string, number>();
    if (wrongObjektIds.length > 0) {
      const objs = await indexer
        .select({ id: objekts.id, serial: objekts.serial })
        .from(objekts)
        .where(inArray(objekts.id, wrongObjektIds));
      serialMap = new Map(objs.map((o) => [o.id, o.serial]));
    }

    let collectionMap = new Map<string, { collectionId: string; collectionNo: string; member: string }>();
    const uniqueCollectionIds = [...new Set(wrongCollectionIds)];
    if (uniqueCollectionIds.length > 0) {
      const colls = await indexer
        .select({
          id: collections.id,
          collectionId: collections.collectionId,
          collectionNo: collections.collectionNo,
          member: collections.member,
        })
        .from(collections)
        .where(inArray(collections.id, uniqueCollectionIds));
      collectionMap = new Map(colls.map((c) => [c.id, { collectionId: c.collectionId, collectionNo: c.collectionNo, member: c.member }]));
    }

    for (const t of wrongTransfers) {
      if (!t.objektId) continue;
      if (loggedEvents.has(`${t.objektId}:wrong_objekt`)) continue;

      const fromLower = t.from.toLowerCase();
      // Determine who sent: if sender is initiator address, initiator sent it
      const isFromInitiator = initiatorSendAddrs.includes(fromLower);
      const senderUserId = isFromInitiator ? trade.initiatorUserId : trade.recipientUserId;
      const recipientUserId = isFromInitiator ? trade.recipientUserId : trade.initiatorUserId;

      const coll = t.collectionId ? collectionMap.get(t.collectionId) : null;

      await db.insert(tradeTransferLog).values({
        activeTradeId: tradeId,
        activeTradeSideId: null,
        fromAddress: t.from,
        toAddress: t.to,
        objektId: t.objektId,
        collectionId: coll?.collectionId ?? t.collectionId ?? "unknown",
        collectionNo: coll?.collectionNo ?? null,
        member: coll?.member ?? null,
        serial: t.objektId ? serialMap.get(t.objektId) ?? null : null,
        senderUserId,
        recipientUserId,
        event: "wrong_objekt",
      });
      updatedCount++;
    }
  }

  // Reload sides after updates
  const freshSides = await db.query.activeTradeSide.findMany({
    where: eq(activeTradeSide.activeTradeId, tradeId),
  });

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
        await db.insert(tradeNotification).values([
          {
            userId: trade.initiatorUserId,
            message: `Active Trade #${tradeId} is complete! Both objekts have been transferred.`,
          },
          {
            userId: trade.recipientUserId,
            message: `Active Trade #${tradeId} is complete! Both objekts have been transferred.`,
          },
        ]);

        // Close both trade posts permanently
        const postIds = [trade.tradePostId, trade.matchedTradePostId].filter((id): id is string => id !== null);
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
                ])
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
                message: `Active Trade #${t.id} was cancelled because Trade #${tradeId} completed first.`,
              },
              {
                userId: t.recipientUserId,
                message: `Active Trade #${t.id} was cancelled because Trade #${tradeId} completed first.`,
              },
            ]);
            await db.insert(tradeNotification).values(notifications);
          }
        }
      }
    }
  }

  // Reload logs to return pre-accept and wrong-objekt warnings
  const freshLogs = await db.query.tradeTransferLog.findMany({
    where: eq(tradeTransferLog.activeTradeId, tradeId),
  });

  const preAcceptLogs = freshLogs.filter((l) =>
    l.event === "pre_accept_sent" || l.event === "pre_accept_confirmed"
  );
  const wrongObjektLogs = freshLogs.filter((l) => l.event === "wrong_objekt");

  return NextResponse.json({
    status: newTradeStatus,
    updated: updatedCount,
    sides: freshSides,
    preAcceptTransfers: preAcceptLogs.length,
    wrongObjektTransfers: wrongObjektLogs.length,
  });
}
