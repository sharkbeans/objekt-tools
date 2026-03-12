import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  tradePost,
  tradePostHave,
  tradePostWant,
} from "@/lib/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";

// GET /api/trades/[id]/matches — find matching trades
// A match is a trade where:
//   - Their "have" items overlap with our "want" items
//   - Their "want" items overlap with our "have" items
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tradeId } = await params;

  // Get the source trade
  const sourceTrade = await db.query.tradePost.findFirst({
    where: eq(tradePost.id, tradeId),
    with: { haves: true, wants: true },
  });

  if (!sourceTrade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  const myHaveCollections = sourceTrade.haves.map((h) => h.collectionId);
  const myWantCollections = sourceTrade.wants.map((w) => w.collectionId);

  if (myHaveCollections.length === 0 || myWantCollections.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  // Find trades where someone has what I want
  const theyHaveWhatIWant = await db
    .selectDistinct({ tradePostId: tradePostHave.tradePostId })
    .from(tradePostHave)
    .where(inArray(tradePostHave.collectionId, myWantCollections));

  // Find trades where someone wants what I have
  const theyWantWhatIHave = await db
    .selectDistinct({ tradePostId: tradePostWant.tradePostId })
    .from(tradePostWant)
    .where(inArray(tradePostWant.collectionId, myHaveCollections));

  // Intersect: trades that appear in both sets
  const haveSet = new Set(theyHaveWhatIWant.map((r) => r.tradePostId));
  const matchingIds = theyWantWhatIHave
    .map((r) => r.tradePostId)
    .filter((id) => haveSet.has(id) && id !== tradeId);

  if (matchingIds.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  // Fetch full matching trades
  const matches = await db.query.tradePost.findMany({
    where: and(
      inArray(tradePost.id, matchingIds),
      eq(tradePost.status, "open"),
      ne(tradePost.userId, sourceTrade.userId)
    ),
    with: {
      haves: true,
      wants: true,
      user: {
        columns: { id: true, name: true, image: true },
        with: {
          cosmoAccount: {
            columns: { nickname: true },
          },
        },
      },
    },
  });

  const enriched = matches.map((m) => ({
    ...m,
    cosmoNickname: m.user.cosmoAccount?.nickname ?? null,
  }));

  return NextResponse.json({ matches: enriched });
}
