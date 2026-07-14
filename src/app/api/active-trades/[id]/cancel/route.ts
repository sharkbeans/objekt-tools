import { and, eq, inArray, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  activeTrade,
  activeTradeSide,
  cosmoAccount,
  tradePost,
  tradeTransferLog,
} from "@/lib/db/schema";
import { notify } from "@/lib/notify";
import { publishTradeEvent } from "@/lib/realtime";
import { issueBan, propagateResolution } from "@/lib/trade-guards";

const CANCEL_TIMEOUT_HOURS = 24;

// POST /api/active-trades/[id]/cancel — either participant cancels
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

  if (
    trade.status === "completed" ||
    trade.status === "cancelled" ||
    trade.status === "countered"
  ) {
    return NextResponse.json(
      { error: "Trade already finalised" },
      { status: 400 },
    );
  }

  // Determine which sides belong to which party
  const mySides = trade.sides.filter((s) => s.userId === session.user.id);
  const otherSides = trade.sides.filter((s) => s.userId !== session.user.id);

  const myConfirmed = mySides.every((s) => s.status === "confirmed");
  const otherConfirmed = otherSides.every((s) => s.status === "confirmed");
  const myAllPending = mySides.every((s) => s.status === "pending");
  const otherAllPending = otherSides.every((s) => s.status === "pending");

  // Both parties have confirmed — trade should complete, cannot cancel
  if (myConfirmed && otherConfirmed) {
    return NextResponse.json(
      {
        error:
          "Cannot cancel: both parties have already transferred. The trade should complete shortly.",
      },
      { status: 400 },
    );
  }

  // Path A: Neither side has sent anything — either party can cancel freely
  const noOneSent = trade.sides.every((s) => s.status === "pending");

  // Path B: I haven't sent anything, other party has confirmed — I can back out
  const iCanBackOut = myAllPending && otherConfirmed;

  // Path C: I've confirmed but other party hasn't sent — allow cancel after timeout.
  // The clock starts from when I sent (earliest detectedAt on my confirmed sides),
  // not from acceptedAt. This protects userB from being banned for not responding
  // within 24h of acceptance if userA only sent much later.
  let timeoutExpired = false;
  if (myConfirmed && otherAllPending) {
    const myConfirmedSides = mySides.filter(
      (s) => s.status === "confirmed" && s.detectedAt,
    );
    const earliestSend =
      myConfirmedSides.length > 0
        ? new Date(
            Math.min(...myConfirmedSides.map((s) => s.detectedAt!.getTime())),
          )
        : trade.acceptedAt;
    if (earliestSend) {
      const hoursSinceSend =
        (Date.now() - earliestSend.getTime()) / (1000 * 60 * 60);
      timeoutExpired = hoursSinceSend >= CANCEL_TIMEOUT_HOURS;
    }
  }

  // Path D: The other party received my objekt(s) and returned them all — clean cancel, no ban.
  // Check transfer logs for "returned" events covering all confirmed sides the other party received.
  let allReceivedReturned = false;
  if (["accepted", "partial"].includes(trade.status)) {
    // "confirmed" sides where the other party was the recipient (i.e. I sent, they received)
    const mySentConfirmedSides = mySides.filter(
      (s) => s.status === "confirmed",
    );
    if (mySentConfirmedSides.length > 0) {
      const returnedLogs = await db.query.tradeTransferLog.findMany({
        where: and(
          eq(tradeTransferLog.activeTradeId, tradeId),
          eq(tradeTransferLog.event, "returned"),
        ),
      });
      const returnedSideIds = new Set(
        returnedLogs.map((l) => l.activeTradeSideId),
      );
      allReceivedReturned = mySentConfirmedSides.every((s) =>
        returnedSideIds.has(s.id),
      );
    }
  }

  if (!noOneSent && !iCanBackOut && !timeoutExpired && !allReceivedReturned) {
    if (myConfirmed && otherAllPending) {
      return NextResponse.json(
        {
          error: `Cannot cancel yet: you must wait ${CANCEL_TIMEOUT_HOURS} hours after sending your objekt before cancelling. Contact support if there is a dispute.`,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          "Cannot cancel: at least one objekt has already been transferred. Contact support if there is a dispute.",
      },
      { status: 400 },
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(activeTrade)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(activeTrade.id, tradeId));

    // If the trade had been accepted (posts were hidden), restore them to open
    if (["accepted", "partial"].includes(trade.status)) {
      const postIds = [trade.tradePostId, trade.matchedTradePostId].filter(
        (id): id is string => id !== null,
      );
      if (postIds.length > 0) {
        await tx
          .update(tradePost)
          .set({ status: "open", updatedAt: new Date() })
          .where(inArray(tradePost.id, postIds));
      }
    }

    // For any cancellation: check if either trade post has remaining active trades.
    // If not, revert "in_trade" posts back to "open" so they aren't stuck.
    const postIdsToCheck = [trade.tradePostId, trade.matchedTradePostId].filter(
      (id): id is string => id !== null,
    );
    for (const postId of postIdsToCheck) {
      const remainingTrade = await tx.query.activeTrade.findFirst({
        where: and(
          or(
            eq(activeTrade.tradePostId, postId),
            eq(activeTrade.matchedTradePostId, postId),
          ),
          inArray(activeTrade.status, ["pending", "accepted", "partial"]),
        ),
      });
      if (!remainingTrade) {
        await tx
          .update(tradePost)
          .set({ status: "open", updatedAt: new Date() })
          .where(
            and(eq(tradePost.id, postId), eq(tradePost.status, "in_trade")),
          );
      }
    }
  });

  const cancellerName = session.user.name;
  const otherUserId =
    trade.initiatorUserId === session.user.id
      ? trade.recipientUserId
      : trade.initiatorUserId;

  // Check if the other party had sent any objekts pre-accept (only relevant for pending trades)
  let otherPartyPreSentCount = 0;
  if (trade.status === "pending") {
    const preAcceptLogs = await db.query.tradeTransferLog.findMany({
      where: and(
        eq(tradeTransferLog.activeTradeId, tradeId),
        eq(tradeTransferLog.senderUserId, otherUserId),
        eq(tradeTransferLog.event, "pre_accept_sent"),
      ),
    });
    otherPartyPreSentCount = preAcceptLogs.length;
  }

  const cancellerMsg = allReceivedReturned
    ? `You cancelled this trade. The other party returned your objekt(s) — no penalties applied.`
    : otherPartyPreSentCount > 0
      ? `You cancelled this trade. The other party had already sent ${otherPartyPreSentCount} objekt(s) — please return them.`
      : `You cancelled this trade.`;

  const otherMsg = allReceivedReturned
    ? `${cancellerName} cancelled this trade. Your returned objekt(s) have been acknowledged — no penalties applied.`
    : otherPartyPreSentCount > 0
      ? `${cancellerName} cancelled this trade. They have been asked to return your ${otherPartyPreSentCount} objekt(s).`
      : `${cancellerName} cancelled this trade.`;

  await notify([
    { userId: session.user.id, activeTradeId: tradeId, message: cancellerMsg },
    { userId: otherUserId, activeTradeId: tradeId, message: otherMsg },
  ]);

  // Issue bans for defaults on accepted/partial trades
  // Path D (allReceivedReturned): other party returned everything — no ban for anyone
  if (["accepted", "partial"].includes(trade.status) && !allReceivedReturned) {
    // Path B: I'm backing out after other party confirmed — I defaulted
    if (iCanBackOut) {
      const myCosmo = await db.query.cosmoAccount.findFirst({
        where: eq(cosmoAccount.userId, session.user.id),
        columns: { cosmoId: true, address: true },
      });
      const myCosmoId =
        myCosmo?.cosmoId?.toString() ?? myCosmo?.address ?? session.user.id;
      await issueBan(
        session.user.id,
        myCosmoId,
        tradeId,
        `Defaulted on Active Trade #${tradeId} (backed out after partner confirmed).`,
      );
    }

    // Path C: Timeout cancel — other party didn't send after 24h, they defaulted
    if (timeoutExpired) {
      const otherCosmo = await db.query.cosmoAccount.findFirst({
        where: eq(cosmoAccount.userId, otherUserId),
        columns: { cosmoId: true, address: true },
      });
      const otherCosmoId =
        otherCosmo?.cosmoId?.toString() ?? otherCosmo?.address ?? otherUserId;
      await issueBan(
        otherUserId,
        otherCosmoId,
        tradeId,
        `Defaulted on Active Trade #${tradeId} (did not send within ${CANCEL_TIMEOUT_HOURS} hours of partner sending).`,
      );
    }
  }

  // Propagate chain resolution (cancelled = terminal state)
  await propagateResolution(tradeId);

  // Realtime: push cancellation to both participants
  void publishTradeEvent(tradeId, "trade:cancelled", {
    activeTradeId: tradeId,
    cancellerName: session.user.name,
  });

  return NextResponse.json({ status: "cancelled" });
}
