import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradePost, tradePostHave, tradePostWant } from "@/lib/db/schema";
import { redis } from "@/lib/redis";

// GET /api/trades/[id]/matches — find matching trades
// A match is a trade where:
//   - Their "have" items overlap with our "want" items
//   - Their "want" items overlap with our "have" items
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

  // Rate limit: 10 requests per 60 seconds
  const rateLimitKey = `rate-limit:matches:${session.user.id}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) {
    await redis.expire(rateLimitKey, 60);
  }
  if (attempts > 10) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 },
    );
  }

  const { id: tradeId } = await params;

  // Get the source trade
  const sourceTrade = await db.query.tradePost.findFirst({
    where: eq(tradePost.id, tradeId),
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      wants: { where: (w, { isNull }) => isNull(w.deletedAt) },
    },
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
    .where(
      and(
        inArray(tradePostHave.collectionId, myWantCollections),
        isNull(tradePostHave.deletedAt),
      ),
    );

  // Find trades where someone wants what I have
  const theyWantWhatIHave = await db
    .selectDistinct({ tradePostId: tradePostWant.tradePostId })
    .from(tradePostWant)
    .where(
      and(
        inArray(tradePostWant.collectionId, myHaveCollections),
        isNull(tradePostWant.deletedAt),
      ),
    );

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
      ne(tradePost.userId, sourceTrade.userId),
    ),
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      wants: { where: (w, { isNull }) => isNull(w.deletedAt) },
      user: {
        columns: { id: true, name: true, image: true },
        with: {
          cosmoAccount: {
            columns: { nickname: true, address: true },
          },
        },
      },
    },
  });

  const enriched = matches.map((m) => ({
    ...m,
    cosmoNickname: m.user.cosmoAccount?.nickname ?? null,
    cosmoAddress: m.user.cosmoAccount?.address ?? null,
  }));

  return NextResponse.json({ matches: enriched });
}
