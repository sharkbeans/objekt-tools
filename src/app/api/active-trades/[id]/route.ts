import { eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { indexer } from "@/lib/db/indexer";
import { collections } from "@/lib/db/indexer-schema";
import { activeTrade } from "@/lib/db/schema";

// GET /api/active-trades/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tradeId } = await params;

  const trade = await db.query.activeTrade.findFirst({
    where: eq(activeTrade.id, tradeId),
    with: {
      sides: {
        with: {
          user: {
            columns: { id: true, name: true, image: true },
            with: { cosmoAccount: { columns: { nickname: true } } },
          },
        },
      },
      initiator: {
        columns: { id: true, name: true, image: true },
        with: { cosmoAccount: { columns: { nickname: true } } },
      },
      recipient: {
        columns: { id: true, name: true, image: true },
        with: { cosmoAccount: { columns: { nickname: true } } },
      },
    },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  // Only participants can view
  if (
    trade.initiatorUserId !== session.user.id &&
    trade.recipientUserId !== session.user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uniqueCollectionIds = [
    ...new Set(trade.sides.map((s) => s.collectionId).filter(Boolean)),
  ];
  const canonicalByCollectionId = new Map<string, string>();

  if (uniqueCollectionIds.length > 0) {
    const rows = await indexer
      .select({
        collectionId: collections.collectionId,
        thumbnailImage: collections.thumbnailImage,
        frontImage: collections.frontImage,
      })
      .from(collections)
      .where(inArray(collections.collectionId, uniqueCollectionIds));

    for (const row of rows) {
      const canonical = row.thumbnailImage ?? row.frontImage;
      if (canonical) {
        canonicalByCollectionId.set(row.collectionId, canonical);
      }
    }
  }

  const mapped = {
    ...trade,
    initiator: {
      ...trade.initiator,
      cosmoNickname: trade.initiator.cosmoAccount?.nickname ?? null,
      cosmoAccount: undefined,
    },
    recipient: {
      ...trade.recipient,
      cosmoNickname: trade.recipient.cosmoAccount?.nickname ?? null,
      cosmoAccount: undefined,
    },
    sides: trade.sides.map((s) => ({
      ...s,
      thumbnailUrl:
        canonicalByCollectionId.get(s.collectionId) ?? s.thumbnailUrl ?? null,
      user: {
        ...s.user,
        cosmoNickname: s.user.cosmoAccount?.nickname ?? null,
        cosmoAccount: undefined,
      },
    })),
  };

  return NextResponse.json(mapped);
}
