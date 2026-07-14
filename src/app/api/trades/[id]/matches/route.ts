import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { redis } from "@/lib/redis";
import { findTradePostMatches } from "@/lib/trade-post-matches";

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

  const result = await findTradePostMatches(tradeId);
  if (!result) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  return NextResponse.json({ matches: result.matches });
}
