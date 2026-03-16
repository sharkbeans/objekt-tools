import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { indexer } from "@/lib/db/indexer";
import { activeTrade, activeTradeSide, tradeNotification, tradePost, tradeTransferLog } from "@/lib/db/schema";
import { objekts, collections } from "@/lib/db/indexer-schema";
import { eq, inArray, and, or, ne } from "drizzle-orm";

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

  // Gather all unique addresses involved in the trade
  const allAddresses = new Set<string>();
  for (const side of trade.sides) {
    allAddresses.add(side.address.toLowerCase());
    allAddresses.add(side.recipientAddress.toLowerCase());
  }

  // Query indexer for current owners of the traded objekts
  const tradeObjektIds = trade.sides.map((s) => s.objektId);
  const owned = await indexer
    .select({ id: objekts.id, owner: objekts.owner })
    .from(objekts)
    .where(inArray(objekts.id, tradeObjektIds));
  const ownerMap = new Map(owned.map((o) => [o.id, o.owner]));

  // Also query indexer for ALL objekts currently owned by any trade address
  // to detect wrong objekt transfers between the parties
  const addressArray = Array.from(allAddresses);
  const allOwnedByParties = await indexer
    .select({
      id: objekts.id,
      owner: objekts.owner,
      serial: objekts.serial,
      collectionId: objekts.collectionId,
    })
    .from(objekts)
    .where(inArray(objekts.owner, addressArray));

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
  const warnings: { type: string; message: string }[] = [];

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
  // Check if any objekt NOT in the trade was transferred between the two parties
  // We check: for each objekt owned by address B, was it previously expected from address A?
  // If the objekt is now owned by address B but it's not one of the trade objekts, log a wrong_objekt warning
  const initiatorAddresses = new Set(
    trade.sides.filter((s) => s.userId === trade.initiatorUserId).map((s) => s.address.toLowerCase())
  );
  const recipientAddresses = new Set(
    trade.sides.filter((s) => s.userId === trade.recipientUserId).map((s) => s.recipientAddress.toLowerCase())
  );
  // Also get recipient's sending addresses and initiator's receiving addresses
  const recipientSendingAddresses = new Set(
    trade.sides.filter((s) => s.userId === trade.recipientUserId).map((s) => s.address.toLowerCase())
  );
  const initiatorReceivingAddresses = new Set(
    trade.sides.filter((s) => s.userId === trade.recipientUserId).map((s) => s.recipientAddress.toLowerCase())
  );

  // Find objekts that are at a recipient's address but are NOT part of this trade
  // We need to check both directions: initiator→recipient and recipient→initiator
  // An objekt is "wrong" if it's now owned by the other party's address but isn't in the trade
  const wrongObjektCandidates = allOwnedByParties.filter((o) => {
    if (tradeObjektIdSet.has(o.id)) return false; // It's a trade objekt, not wrong
    const ownerLower = o.owner.toLowerCase();
    // Is this objekt at the recipient's address? (could be wrong objekt from initiator)
    // Or at the initiator's receiving address? (could be wrong objekt from recipient)
    return recipientAddresses.has(ownerLower) || initiatorReceivingAddresses.has(ownerLower);
  });

  // We can't tell who sent a wrong objekt just from current ownership. We only log if not already logged.
  // Fetch collection details for wrong objekt candidates to show nice names
  if (wrongObjektCandidates.length > 0) {
    const collectionIds = wrongObjektCandidates
      .map((o) => o.collectionId)
      .filter((id): id is string => id !== null);
    const uniqueCollectionIds = [...new Set(collectionIds)];

    let collectionMap = new Map<string, { collectionNo: string; member: string }>();
    if (uniqueCollectionIds.length > 0) {
      const colls = await indexer
        .select({
          id: collections.id,
          collectionNo: collections.collectionNo,
          member: collections.member,
        })
        .from(collections)
        .where(inArray(collections.id, uniqueCollectionIds));
      collectionMap = new Map(colls.map((c) => [c.id, { collectionNo: c.collectionNo, member: c.member }]));
    }

    for (const obj of wrongObjektCandidates) {
      if (loggedEvents.has(`${obj.id}:wrong_objekt`)) continue;

      const ownerLower = obj.owner.toLowerCase();
      // Determine direction: who received this wrong objekt?
      const isAtRecipientAddr = recipientAddresses.has(ownerLower);
      const senderUserId = isAtRecipientAddr ? trade.initiatorUserId : trade.recipientUserId;
      const recipientUserId = isAtRecipientAddr ? trade.recipientUserId : trade.initiatorUserId;
      const fromAddr = isAtRecipientAddr
        ? Array.from(initiatorAddresses)[0]
        : Array.from(recipientSendingAddresses)[0];

      const coll = obj.collectionId ? collectionMap.get(obj.collectionId) : null;

      await db.insert(tradeTransferLog).values({
        activeTradeId: tradeId,
        activeTradeSideId: null,
        fromAddress: fromAddr ?? "unknown",
        toAddress: obj.owner,
        objektId: obj.id,
        collectionId: coll?.collectionNo ?? obj.collectionId ?? "unknown",
        collectionNo: coll?.collectionNo ?? null,
        member: coll?.member ?? null,
        serial: obj.serial,
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
