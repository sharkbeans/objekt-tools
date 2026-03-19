import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  tradePost,
  tradePostHave,
  tradePostWant,
  cosmoAccount,
} from "@/lib/db/schema";
import { eq, desc, asc, count } from "drizzle-orm";
import { tradeMatchesFilters, parseFiltersFromParams, hasAnyFilter } from "@/lib/filter-utils";
import { getBlockingTradeId } from "@/lib/trade-guards";

interface TradeItemInput {
  collectionId: string;
  collectionNo?: string;
  member?: string;
  season?: string;
  class?: string;
  thumbnailUrl?: string;
  serial?: number;
  objektId?: string;
  // ANY-filter wants
  isAny?: boolean;
  artist?: string;
}

// GET /api/trades — list trades with filters
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Pagination
  const page = Number(params.get("page") ?? "1");
  const limit = Math.min(Number(params.get("limit") ?? "12"), 50);
  const offset = (page - 1) * limit;

  const filters = parseFiltersFromParams(params);

  const sort = params.get("sort") ?? "newest";
  const status = params.get("status") ?? "open";

  const filterMode = (params.get("filter_mode") ?? "haves") as "haves" | "wants" | "both";
  const hasFilters = hasAnyFilter(filters);

  const trades = await db.query.tradePost.findMany({
    where: eq(tradePost.status, status),
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
    // When no filters, use DB-level pagination; otherwise over-fetch for post-filter pagination
    ...(hasFilters ? { limit: 500, offset: 0 } : { limit, offset }),
  });

  let paginated: typeof trades;
  let total: number;

  if (hasFilters) {
    const filtered = trades.filter((t) => tradeMatchesFilters(t, filters, filterMode));
    paginated = filtered.slice(offset, offset + limit);
    total = filtered.length;
  } else {
    paginated = trades;
    // For unfiltered queries, get count with a lightweight SQL count
    const [{ value }] = await db.select({ value: count() }).from(tradePost).where(eq(tradePost.status, status));
    total = value;
  }

  const enriched = paginated.map((t) => ({
    ...t,
    cosmoNickname: t.user.cosmoAccount?.nickname ?? null,
  }));

  return NextResponse.json({ trades: enriched, page, limit, total });
}

// POST /api/trades — create a new trade post
export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { description, haves, wants, wantsOnly } = body as {
    description?: string;
    haves: TradeItemInput[];
    wants: TradeItemInput[];
    wantsOnly?: boolean;
  };

  if (!haves?.length || !wants?.length) {
    return NextResponse.json(
      { error: "Must have at least one 'have' and one 'want' item" },
      { status: 400 }
    );
  }

  // ANY wants must have at least one filter set (artist, member, season, or class)
  for (const w of wants) {
    if (w.isAny && !w.artist && !w.member && !w.season && !w.class) {
      return NextResponse.json(
        { error: "ANY want items must specify at least one filter (artist, member, season, or class)" },
        { status: 400 }
      );
    }
  }

  // Block if user has unsent objekts in an accepted trade
  const blockingTradeId = await getBlockingTradeId(session.user.id);
  if (blockingTradeId) {
    return NextResponse.json(
      { error: "You must send all your objekts in your current active trade before creating a new post", activeTradeId: blockingTradeId },
      { status: 403 }
    );
  }

  // Check user has linked Cosmo account
  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, session.user.id),
  });
  if (!linked) {
    return NextResponse.json(
      { error: "Link your Cosmo account first" },
      { status: 403 }
    );
  }

  // Create trade post with items
  const [post] = await db
    .insert(tradePost)
    .values({
      userId: session.user.id,
      description: description ?? null,
      wantsOnly: wantsOnly ?? false,
    })
    .returning();

  await db.insert(tradePostHave).values(
    haves.map((h) => ({
      tradePostId: post.id,
      collectionId: h.collectionId,
      collectionNo: h.collectionNo ?? null,
      member: h.member ?? null,
      season: h.season ?? null,
      class: h.class ?? null,
      thumbnailUrl: h.thumbnailUrl ?? null,
      serial: h.serial ?? null,
      objektId: h.objektId ?? null,
    }))
  );

  await db.insert(tradePostWant).values(
    wants.map((w) => ({
      tradePostId: post.id,
      collectionId: w.isAny ? "" : w.collectionId,
      collectionNo: w.collectionNo ?? null,
      member: w.member ?? null,
      season: w.season ?? null,
      class: w.class ?? null,
      thumbnailUrl: w.thumbnailUrl ?? null,
      isAny: w.isAny ?? false,
      artist: w.artist ?? null,
    }))
  );

  return NextResponse.json({ id: post.id }, { status: 201 });
}
