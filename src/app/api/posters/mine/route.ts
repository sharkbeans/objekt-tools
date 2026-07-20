import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  poster,
  posterHave,
  posterWant,
  tradePost,
  tradePostHave,
  tradePostWant,
} from "@/lib/db/schema";

// GET /api/posters/mine — authenticated user's posters
export async function GET(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = 12;
  const offset = (page - 1) * limit;

  const [posters, [totalRow]] = await Promise.all([
    db.query.poster.findMany({
      where: eq(poster.userId, session.user.id),
      orderBy: desc(poster.updatedAt),
      limit,
      offset,
      with: {
        haves: {
          columns: {
            id: true,
            thumbnailUrl: true,
            quantity: true,
            member: true,
            season: true,
            collectionNo: true,
            collectionId: true,
          },
          orderBy: asc(posterHave.position),
        },
        wants: {
          columns: {
            id: true,
            thumbnailUrl: true,
            quantity: true,
            member: true,
            season: true,
            collectionNo: true,
            collectionId: true,
          },
          orderBy: asc(posterWant.position),
        },
      },
    }),
    db
      .select({ n: count() })
      .from(poster)
      .where(eq(poster.userId, session.user.id)),
  ]);

  const matchCounts = await getMatchCounts(
    posters.map((p) => p.id),
    session.user.id,
  );

  return NextResponse.json({
    posters,
    total: totalRow?.n ?? 0,
    limit,
    matchCounts,
  });
}

// Batched per-poster match count: same overlap logic as
// /api/trades/mine/matches-count, but scoped to this page's posters' mirrored
// trade posts and grouped back by poster id (one query round-trip regardless
// of poster count, instead of N calls to the single-trade matches endpoint).
async function getMatchCounts(
  posterIds: string[],
  userId: string,
): Promise<Record<string, number>> {
  if (posterIds.length === 0) return {};

  const mirrors = await db.query.tradePost.findMany({
    where: and(
      inArray(tradePost.linkedPosterId, posterIds),
      eq(tradePost.status, "open"),
    ),
    columns: { id: true, linkedPosterId: true },
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      wants: { where: (w, { isNull }) => isNull(w.deletedAt) },
    },
  });
  if (mirrors.length === 0) return {};

  const allWantCollections = [
    ...new Set(mirrors.flatMap((m) => m.wants.map((w) => w.collectionId))),
  ];
  const allHaveCollections = [
    ...new Set(mirrors.flatMap((m) => m.haves.map((h) => h.collectionId))),
  ];
  if (allWantCollections.length === 0 || allHaveCollections.length === 0) {
    return {};
  }

  const [theyHaveRows, theyWantRows] = await Promise.all([
    db
      .selectDistinct({
        tradePostId: tradePostHave.tradePostId,
        collectionId: tradePostHave.collectionId,
      })
      .from(tradePostHave)
      .where(
        and(
          inArray(tradePostHave.collectionId, allWantCollections),
          isNull(tradePostHave.deletedAt),
        ),
      ),
    db
      .selectDistinct({
        tradePostId: tradePostWant.tradePostId,
        collectionId: tradePostWant.collectionId,
      })
      .from(tradePostWant)
      .where(
        and(
          inArray(tradePostWant.collectionId, allHaveCollections),
          isNull(tradePostWant.deletedAt),
        ),
      ),
  ]);

  const theyHaveMap = new Map<string, Set<string>>();
  for (const r of theyHaveRows) {
    if (!theyHaveMap.has(r.tradePostId))
      theyHaveMap.set(r.tradePostId, new Set());
    theyHaveMap.get(r.tradePostId)?.add(r.collectionId);
  }
  const theyWantMap = new Map<string, Set<string>>();
  for (const r of theyWantRows) {
    if (!theyWantMap.has(r.tradePostId))
      theyWantMap.set(r.tradePostId, new Set());
    theyWantMap.get(r.tradePostId)?.add(r.collectionId);
  }

  const mirrorTradeIds = new Set(mirrors.map((m) => m.id));
  const candidateIds = new Set<string>();
  const candidatesByMirror = new Map<string, Set<string>>();

  for (const mirror of mirrors) {
    const myWants = new Set(mirror.wants.map((w) => w.collectionId));
    const myHaves = new Set(mirror.haves.map((h) => h.collectionId));
    const matches = new Set<string>();

    for (const [otherTradeId, theirHaves] of theyHaveMap) {
      if (mirrorTradeIds.has(otherTradeId)) continue;
      const theirWants = theyWantMap.get(otherTradeId);
      if (!theirWants) continue;

      const hasOverlapHave = [...theirHaves].some((c) => myWants.has(c));
      const hasOverlapWant = [...theirWants].some((c) => myHaves.has(c));
      if (hasOverlapHave && hasOverlapWant) {
        matches.add(otherTradeId);
        candidateIds.add(otherTradeId);
      }
    }
    candidatesByMirror.set(mirror.id, matches);
  }

  if (candidateIds.size === 0) return {};

  const validMatches = await db.query.tradePost.findMany({
    where: and(
      inArray(tradePost.id, [...candidateIds]),
      eq(tradePost.status, "open"),
      ne(tradePost.userId, userId),
    ),
    columns: { id: true },
  });
  const validIds = new Set(validMatches.map((t) => t.id));

  const result: Record<string, number> = {};
  for (const mirror of mirrors) {
    if (!mirror.linkedPosterId) continue;
    const matches = candidatesByMirror.get(mirror.id) ?? new Set();
    const validCount = [...matches].filter((id) => validIds.has(id)).length;
    result[mirror.linkedPosterId] = validCount;
  }
  return result;
}
