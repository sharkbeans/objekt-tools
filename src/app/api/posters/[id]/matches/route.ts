import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { poster, tradePost } from "@/lib/db/schema";
import { findTradePostMatches } from "@/lib/trade-post-matches";

// GET /api/posters/[id]/matches — find trade partners for a poster's
// haves/wants, via its mirrored "list" trade post (see poster-trade-sync.ts).
// Owner-only: unlike /api/trades/[id]/matches (which surfaces public trade
// posts anyone can browse), this is the poster owner's private discovery view.
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

  const { id: posterId } = await params;

  const posterRow = await db.query.poster.findFirst({
    where: eq(poster.id, posterId),
    columns: { id: true, userId: true },
  });

  if (!posterRow) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  if (posterRow.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const linkedTradePost = await db.query.tradePost.findFirst({
    where: eq(tradePost.linkedPosterId, posterId),
    columns: { id: true },
  });

  if (!linkedTradePost) {
    return NextResponse.json({ matches: [] });
  }

  const result = await findTradePostMatches(linkedTradePost.id);
  return NextResponse.json({ matches: result?.matches ?? [] });
}
