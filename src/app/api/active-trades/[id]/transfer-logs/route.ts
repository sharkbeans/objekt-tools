import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade, tradeTransferLog } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

// GET /api/active-trades/[id]/transfer-logs
export async function GET(
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

  const logs = await db.query.tradeTransferLog.findMany({
    where: eq(tradeTransferLog.activeTradeId, tradeId),
    orderBy: [asc(tradeTransferLog.detectedAt)],
    with: {
      sender: {
        columns: { id: true, name: true },
        with: { cosmoAccount: { columns: { nickname: true } } },
      },
      recipient: {
        columns: { id: true, name: true },
        with: { cosmoAccount: { columns: { nickname: true } } },
      },
    },
  });

  const mapped = logs.map((log) => ({
    id: log.id,
    event: log.event,
    objektId: log.objektId,
    collectionId: log.collectionId,
    collectionNo: log.collectionNo,
    member: log.member,
    serial: log.serial,
    fromAddress: log.fromAddress,
    toAddress: log.toAddress,
    senderUserId: log.senderUserId,
    recipientUserId: log.recipientUserId,
    senderName: log.sender.cosmoAccount?.nickname ?? log.sender.name,
    recipientName: log.recipient.cosmoAccount?.nickname ?? log.recipient.name,
    detectedAt: log.detectedAt,
  }));

  return NextResponse.json(mapped);
}
