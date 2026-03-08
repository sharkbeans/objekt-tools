import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradePost } from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { tradeMatchesFilters, parseFiltersFromParams, hasAnyFilter } from "@/lib/filter-utils";

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const page = Number(params.get("page") ?? "1");
  const limit = Math.min(Number(params.get("limit") ?? "20"), 50);
  const offset = (page - 1) * limit;
  const sort = params.get("sort") ?? "newest";

  const filters = parseFiltersFromParams(params);
  const filterMode = (params.get("filter_mode") ?? "haves") as "haves" | "wants" | "both";

  const trades = await db.query.tradePost.findMany({
    where: eq(tradePost.userId, session.user.id),
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
    orderBy: sort === "oldest" ? [asc(tradePost.createdAt)] : [desc(tradePost.createdAt)],
  });

  const filtered = hasAnyFilter(filters)
    ? trades.filter((t) => tradeMatchesFilters(t, filters, filterMode))
    : trades;

  const paginated = filtered.slice(offset, offset + limit);
  const total = filtered.length;

  const enriched = paginated.map((t) => ({
    ...t,
    cosmoNickname: t.user.cosmoAccount?.nickname ?? null,
  }));

  return NextResponse.json({ trades: enriched, page, limit, total });
}
