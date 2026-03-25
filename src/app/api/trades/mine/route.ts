import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradePost } from "@/lib/db/schema";
import { eq, desc, asc, count } from "drizzle-orm";
import { tradeMatchesFilters, parseFiltersFromParams, hasAnyFilter } from "@/lib/filter-utils";

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Math.floor(Number(params.get("page") ?? "1")) || 1);
  const limit = Math.min(Number(params.get("limit") ?? "12"), 50);
  const offset = (page - 1) * limit;
  const sort = params.get("sort") ?? "newest";

  const filters = parseFiltersFromParams(params);
  const filterMode = (params.get("filter_mode") ?? "haves") as "haves" | "wants" | "both";
  const hasFilters = hasAnyFilter(filters);

  const trades = await db.query.tradePost.findMany({
    where: eq(tradePost.userId, session.user.id),
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
    orderBy: sort === "oldest" ? [asc(tradePost.createdAt)] : [desc(tradePost.createdAt)],
    // When no filters, use DB-level pagination; otherwise fetch all for post-filter pagination
    ...(!hasFilters ? { limit, offset } : {}),
  });

  let paginated: typeof trades;
  let total: number;

  if (hasFilters) {
    const filtered = trades.filter((t) => tradeMatchesFilters(t, filters, filterMode));
    paginated = filtered.slice(offset, offset + limit);
    total = filtered.length;
  } else {
    paginated = trades;
    const [{ value }] = await db.select({ value: count() }).from(tradePost).where(eq(tradePost.userId, session.user.id));
    total = value;
  }

  const enriched = paginated.map((t) => ({
    ...t,
    cosmoNickname: t.user.cosmoAccount?.nickname ?? null,
    cosmoAddress: t.user.cosmoAccount?.address ?? null,
  }));

  return NextResponse.json({ trades: enriched, page, limit, total });
}
