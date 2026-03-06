import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  tradePost,
  tradePostHave,
  tradePostWant,
} from "@/lib/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";

// GET /api/trades/mine/matches-count — total match count across all user's open trades
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all open trades for the user
  const myTrades = await db.query.tradePost.findMany({
    where: and(
      eq(tradePost.userId, session.user.id),
      eq(tradePost.status, "open")
    ),
    with: { haves: true, wants: true },
  });

  if (myTrades.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  let totalMatchIds = new Set<number>();

  for (const trade of myTrades) {
    const myHaveCollections = trade.haves.map((h) => h.collectionId);
    const myWantCollections = trade.wants.map((w) => w.collectionId);

    if (myHaveCollections.length === 0 || myWantCollections.length === 0) {
      continue;
    }

    const theyHaveWhatIWant = await db
      .selectDistinct({ tradePostId: tradePostHave.tradePostId })
      .from(tradePostHave)
      .where(inArray(tradePostHave.collectionId, myWantCollections));

    const theyWantWhatIHave = await db
      .selectDistinct({ tradePostId: tradePostWant.tradePostId })
      .from(tradePostWant)
      .where(inArray(tradePostWant.collectionId, myHaveCollections));

    const haveSet = new Set(theyHaveWhatIWant.map((r) => r.tradePostId));
    const matchingIds = theyWantWhatIHave
      .map((r) => r.tradePostId)
      .filter((id) => haveSet.has(id) && id !== trade.id);

    if (matchingIds.length === 0) continue;

    // Verify matches are open and from other users
    const validMatches = await db.query.tradePost.findMany({
      where: and(
        inArray(tradePost.id, matchingIds),
        eq(tradePost.status, "open"),
        ne(tradePost.userId, session.user.id)
      ),
      columns: { id: true },
    });

    for (const m of validMatches) {
      totalMatchIds.add(m.id);
    }
  }

  return NextResponse.json({ count: totalMatchIds.size });
}
