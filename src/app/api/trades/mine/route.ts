import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradePost } from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { tradeMatchesFilters, type TradeFilters } from "@/lib/filter-utils";

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

  const filters: TradeFilters = {
    artist: params.getAll("artist").filter(Boolean),
    member: params.getAll("member").filter(Boolean),
    season: params.getAll("season").filter(Boolean),
    class: params.getAll("class").filter(Boolean),
    on_offline: params.getAll("on_offline").filter(Boolean),
    search: params.get("search") ?? "",
  };

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

  const hasAnyFilter =
    (filters.artist?.length ?? 0) > 0 ||
    (filters.member?.length ?? 0) > 0 ||
    (filters.season?.length ?? 0) > 0 ||
    (filters.class?.length ?? 0) > 0 ||
    (filters.on_offline?.length ?? 0) > 0 ||
    !!filters.search;

  const filtered = hasAnyFilter
    ? trades.filter((t) => tradeMatchesFilters(t, filters))
    : trades;

  const paginated = filtered.slice(offset, offset + limit);
  const total = filtered.length;

  const enriched = paginated.map((t) => ({
    ...t,
    cosmoNickname: t.user.cosmoAccount?.nickname ?? null,
  }));

  return NextResponse.json({ trades: enriched, page, limit, total });
}
