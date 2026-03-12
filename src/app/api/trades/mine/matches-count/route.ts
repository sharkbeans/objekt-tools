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
// Batched: 3 queries total instead of 3*N
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Collect all unique collectionIds across all my trades
  const allMyWantCollections = [
    ...new Set(myTrades.flatMap((t) => t.wants.map((w) => w.collectionId))),
  ];
  const allMyHaveCollections = [
    ...new Set(myTrades.flatMap((t) => t.haves.map((h) => h.collectionId))),
  ];

  if (allMyWantCollections.length === 0 || allMyHaveCollections.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  // Two batch queries instead of 2*N
  const [theyHaveRows, theyWantRows] = await Promise.all([
    db
      .selectDistinct({
        tradePostId: tradePostHave.tradePostId,
        collectionId: tradePostHave.collectionId,
      })
      .from(tradePostHave)
      .where(inArray(tradePostHave.collectionId, allMyWantCollections)),
    db
      .selectDistinct({
        tradePostId: tradePostWant.tradePostId,
        collectionId: tradePostWant.collectionId,
      })
      .from(tradePostWant)
      .where(inArray(tradePostWant.collectionId, allMyHaveCollections)),
  ]);

  // Build lookup: tradePostId -> Set<collectionId>
  const theyHaveMap = new Map<string, Set<string>>();
  for (const r of theyHaveRows) {
    if (!theyHaveMap.has(r.tradePostId))
      theyHaveMap.set(r.tradePostId, new Set());
    theyHaveMap.get(r.tradePostId)!.add(r.collectionId);
  }

  const theyWantMap = new Map<string, Set<string>>();
  for (const r of theyWantRows) {
    if (!theyWantMap.has(r.tradePostId))
      theyWantMap.set(r.tradePostId, new Set());
    theyWantMap.get(r.tradePostId)!.add(r.collectionId);
  }

  // Find matching trade IDs across all my trades
  const myTradeIds = new Set(myTrades.map((t) => t.id));
  const candidateIds = new Set<string>();

  for (const trade of myTrades) {
    const myWants = new Set(trade.wants.map((w) => w.collectionId));
    const myHaves = new Set(trade.haves.map((h) => h.collectionId));

    for (const [otherTradeId, theirHaves] of theyHaveMap) {
      if (myTradeIds.has(otherTradeId)) continue;
      const theirWants = theyWantMap.get(otherTradeId);
      if (!theirWants) continue;

      const hasOverlapHave = [...theirHaves].some((c) => myWants.has(c));
      const hasOverlapWant = [...theirWants].some((c) => myHaves.has(c));

      if (hasOverlapHave && hasOverlapWant) {
        candidateIds.add(otherTradeId);
      }
    }
  }

  if (candidateIds.size === 0) {
    return NextResponse.json({ count: 0 });
  }

  // Single validation query
  const validMatches = await db.query.tradePost.findMany({
    where: and(
      inArray(tradePost.id, [...candidateIds]),
      eq(tradePost.status, "open"),
      ne(tradePost.userId, session.user.id)
    ),
    columns: { id: true },
  });

  return NextResponse.json({ count: validMatches.length });
}
