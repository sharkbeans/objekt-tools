import { asc, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade, cosmoAccount, tradeTransferLog } from "@/lib/db/schema";

// GET /api/active-trades/[id]/transfer-logs
export async function GET(
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
    limit: 500,
    with: {
      sender: {
        columns: { id: true, name: true },
        with: { cosmoAccount: { columns: { nickname: true, address: true } } },
      },
      recipient: {
        columns: { id: true, name: true },
        with: { cosmoAccount: { columns: { nickname: true, address: true } } },
      },
    },
  });

  // Resolve toAddress → cosmo nickname for wrong_recipient logs
  const wrongRecipientAddresses = logs
    .filter((l) => l.event === "wrong_recipient")
    .map((l) => l.toAddress.toLowerCase());

  const toAddressNicknameMap = new Map<string, string | null>();
  if (wrongRecipientAddresses.length > 0) {
    const accounts = await db.query.cosmoAccount.findMany({
      where: inArray(cosmoAccount.address, wrongRecipientAddresses),
      columns: { address: true, nickname: true },
    });
    for (const account of accounts) {
      toAddressNicknameMap.set(
        account.address.toLowerCase(),
        account.nickname ?? null,
      );
    }
  }

  const mapped = logs.map((log) => ({
    id: log.id,
    event: log.event,
    activeTradeSideId: log.activeTradeSideId,
    objektId: log.objektId,
    collectionId: log.collectionId,
    collectionNo: log.collectionNo,
    member: log.member,
    serial: log.serial,
    fromAddress: log.fromAddress,
    toAddress: log.toAddress,
    toName: toAddressNicknameMap.get(log.toAddress.toLowerCase()) ?? null,
    senderUserId: log.senderUserId,
    recipientUserId: log.recipientUserId,
    senderName: log.sender.cosmoAccount?.nickname ?? log.sender.name,
    recipientName: log.recipient.cosmoAccount?.nickname ?? log.recipient.name,
    detectedAt: log.detectedAt,
  }));

  return NextResponse.json(mapped);
}
