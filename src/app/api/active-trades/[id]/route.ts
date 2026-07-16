export const dynamic = "force-dynamic";

import { eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { mirror } from "@/lib/db/indexer-mirror";
import { collections } from "@/lib/db/indexer-schema";
import { activeTrade, cosmoAccount, user } from "@/lib/db/schema";

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
            with: {
              cosmoAccount: { columns: { nickname: true, address: true } },
            },
          },
        },
      },
      initiator: {
        columns: {
          id: true,
          name: true,
          image: true,
          discordId: true,
          discordUsername: true,
        },
        with: { cosmoAccount: { columns: { nickname: true, address: true } } },
      },
      recipient: {
        columns: {
          id: true,
          name: true,
          image: true,
          discordId: true,
          discordUsername: true,
        },
        with: { cosmoAccount: { columns: { nickname: true, address: true } } },
      },
      counterOffers: {
        columns: { id: true, status: true },
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
    // Collection thumbnails only — safe to read from the mirror even though
    // the rest of this route is trade-critical (see Part 2 plan, Phase 6).
    const rows = await mirror
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

  // Walk the counter-offer chain to build negotiation history
  const counterOfferChain: Array<{
    id: string;
    status: string;
    initiatorUserId: string;
    recipientUserId: string;
    createdAt: Date;
    initiatorName: string;
    recipientName: string;
  }> = [];

  if (trade.counterOfferToId) {
    // Walk backwards from this trade through the chain
    let currentId: string | null = trade.counterOfferToId;
    while (currentId && counterOfferChain.length < 20) {
      const [ancestor] = await db
        .select({
          id: activeTrade.id,
          status: activeTrade.status,
          initiatorUserId: activeTrade.initiatorUserId,
          recipientUserId: activeTrade.recipientUserId,
          createdAt: activeTrade.createdAt,
          counterOfferToId: activeTrade.counterOfferToId,
        })
        .from(activeTrade)
        .where(eq(activeTrade.id, currentId))
        .limit(1);
      if (!ancestor) break;

      // Fetch display names for both parties
      const [initiatorRow] = await db
        .select({ name: user.name, nickname: cosmoAccount.nickname })
        .from(user)
        .leftJoin(cosmoAccount, eq(user.id, cosmoAccount.userId))
        .where(eq(user.id, ancestor.initiatorUserId))
        .limit(1);
      const [recipientRow] = await db
        .select({ name: user.name, nickname: cosmoAccount.nickname })
        .from(user)
        .leftJoin(cosmoAccount, eq(user.id, cosmoAccount.userId))
        .where(eq(user.id, ancestor.recipientUserId))
        .limit(1);

      counterOfferChain.unshift({
        id: ancestor.id,
        status: ancestor.status,
        initiatorUserId: ancestor.initiatorUserId,
        recipientUserId: ancestor.recipientUserId,
        createdAt: ancestor.createdAt,
        initiatorName:
          initiatorRow?.nickname ?? initiatorRow?.name ?? "Unknown",
        recipientName:
          recipientRow?.nickname ?? recipientRow?.name ?? "Unknown",
      });
      currentId = ancestor.counterOfferToId;
    }
  }

  // The counter-offer made TO this trade (if status is "countered")
  const counterOfferId = trade.counterOffers?.[0]?.id ?? null;

  const mapped = {
    ...trade,
    counterOfferToId: trade.counterOfferToId ?? null,
    counterOfferId,
    counterOfferChain,
    counterOffers: undefined,
    initiator: {
      ...trade.initiator,
      cosmoNickname: trade.initiator.cosmoAccount?.nickname ?? null,
      cosmoAddress: trade.initiator.cosmoAccount?.address ?? null,
      discordId: trade.initiator.discordId ?? null,
      discordUsername: trade.initiator.discordUsername ?? null,
      cosmoAccount: undefined,
    },
    recipient: {
      ...trade.recipient,
      cosmoNickname: trade.recipient.cosmoAccount?.nickname ?? null,
      cosmoAddress: trade.recipient.cosmoAccount?.address ?? null,
      discordId: trade.recipient.discordId ?? null,
      discordUsername: trade.recipient.discordUsername ?? null,
      cosmoAccount: undefined,
    },
    sides: trade.sides.map((s) => ({
      ...s,
      thumbnailUrl:
        canonicalByCollectionId.get(s.collectionId) ?? s.thumbnailUrl ?? null,
      user: {
        ...s.user,
        cosmoNickname: s.user.cosmoAccount?.nickname ?? null,
        cosmoAddress: s.user.cosmoAccount?.address ?? null,
        cosmoAccount: undefined,
      },
    })),
  };

  return NextResponse.json(mapped);
}
