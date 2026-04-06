import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { tradePost } from "@/lib/db/schema";
import { parseFiltersFromParams } from "@/lib/filter-utils";
import { parsePaginationParams } from "@/lib/pagination";
import { listTradesPage } from "@/lib/trade-listing";

export async function GET(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const { page, limit } = parsePaginationParams(params);
  const sort = (params.get("sort") ?? "newest") as "newest" | "oldest";

  const filters = parseFiltersFromParams(params);
  const filterMode = (params.get("filter_mode") ?? "haves") as
    | "haves"
    | "wants"
    | "both";

  const { trades, total } = await listTradesPage({
    where: eq(tradePost.userId, session.user.id),
    filters,
    filterMode,
    sort,
    page,
    limit,
  });

  const enriched = trades.map((t) => ({
    ...t,
    cosmoNickname: t.user.cosmoAccount?.nickname ?? null,
    cosmoAddress: t.user.cosmoAccount?.address ?? null,
  }));

  return NextResponse.json({ trades: enriched, page, limit, total });
}
