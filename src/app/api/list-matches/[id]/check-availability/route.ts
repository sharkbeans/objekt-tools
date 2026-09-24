export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { redis } from "@/lib/redis";
import { verifyTradePostAvailability } from "@/lib/trade/trade-availability";

// POST /api/list-matches/[id]/check-availability — re-verify a matched post's
// haves against the indexer before a List owner opens the match (see
// list-detail-client's handleOpenMatch). [id] is the matched tradePost id —
// the List matching index. Moved here from /api/trades/[id]/check-availability
// ahead of the trades retirement (plan 039).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tradeId } = await params;

  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 requests per 60 seconds
  const rateLimitKey = `rate-limit:check-avail:${session.user.id}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, 60);
  if (attempts > 10) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  const result = await verifyTradePostAvailability(tradeId);
  if (!result) {
    return NextResponse.json(
      { error: "Trade not found or not open" },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
