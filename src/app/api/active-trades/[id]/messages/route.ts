import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade, tradeMessage } from "@/lib/db/schema";
import { eq, and, asc, desc, notInArray } from "drizzle-orm";

const MAX_MESSAGES = 10;
const MAX_CONTENT_LENGTH = 500;

async function getTradeAndVerifyParticipant(tradeId: string, userId: string) {
  const trade = await db.query.activeTrade.findFirst({
    where: eq(activeTrade.id, tradeId),
  });

  if (!trade) return null;
  if (trade.initiatorUserId !== userId && trade.recipientUserId !== userId) return null;
  return trade;
}

// GET /api/active-trades/[id]/messages — fetch messages for this trade
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
  const trade = await getTradeAndVerifyParticipant(tradeId, session.user.id);
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  const messages = await db.query.tradeMessage.findMany({
    where: eq(tradeMessage.activeTradeId, tradeId),
    orderBy: [asc(tradeMessage.createdAt)],
    with: {
      user: {
        columns: { id: true, name: true, image: true },
        with: { cosmoAccount: { columns: { nickname: true } } },
      },
    },
  });

  const mapped = messages.map((m) => ({
    id: m.id,
    userId: m.userId,
    content: m.content,
    createdAt: m.createdAt,
    user: {
      id: m.user.id,
      name: m.user.name,
      image: m.user.image,
      cosmoNickname: m.user.cosmoAccount?.nickname ?? null,
    },
  }));

  return NextResponse.json(mapped);
}

// POST /api/active-trades/[id]/messages — send a message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tradeId } = await params;
  const trade = await getTradeAndVerifyParticipant(tradeId, session.user.id);
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  const body = await request.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content || content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: `Message must be 1-${MAX_CONTENT_LENGTH} characters` },
      { status: 400 }
    );
  }

  // Insert the new message
  await db.insert(tradeMessage).values({
    activeTradeId: tradeId,
    userId: session.user.id,
    content,
  });

  // Enforce the 10-message cap: keep only the newest MAX_MESSAGES, delete the rest
  const keepMessages = await db.query.tradeMessage.findMany({
    where: eq(tradeMessage.activeTradeId, tradeId),
    orderBy: [desc(tradeMessage.createdAt)],
    limit: MAX_MESSAGES,
    columns: { id: true },
  });

  const keepIds = keepMessages.map((m) => m.id);

  if (keepIds.length === MAX_MESSAGES) {
    await db
      .delete(tradeMessage)
      .where(
        and(
          eq(tradeMessage.activeTradeId, tradeId),
          notInArray(tradeMessage.id, keepIds)
        )
      );
  }

  return NextResponse.json({ ok: true });
}
