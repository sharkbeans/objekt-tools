import { and, eq, ilike, inArray, isNull, ne } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  cosmoAccount,
  tradePost,
  tradePostHave,
  tradePostWant,
} from "@/lib/db/schema";
import { parseFiltersFromParams } from "@/lib/filter-utils";
import { notify } from "@/lib/notify";
import { parsePaginationParams } from "@/lib/pagination";
import { redis } from "@/lib/redis";
import { sanitizeNoteText } from "@/lib/sanitize-text";
import { getCached } from "@/lib/server-cache";
import { getActiveBan, getBlockingTradeId } from "@/lib/trade-guards";
import { listTradesPage } from "@/lib/trade-listing";

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

function normalizeCacheKey(params: URLSearchParams) {
  const normalized = new URLSearchParams();
  for (const key of [...new Set(params.keys())].sort()) {
    for (const value of params.getAll(key).sort()) {
      normalized.append(key, value);
    }
  }
  return normalized.toString();
}

function isWalletAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

const emptyPageHeaders = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
  "X-Robots-Tag": "noindex, nofollow",
};

// GET /api/trades — list trades with filters
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const { page, limit } = parsePaginationParams(params);

  const filters = parseFiltersFromParams(params);

  const sort = (params.get("sort") ?? "newest") as "newest" | "oldest";
  const status = params.get("status") ?? "open";

  const filterMode = (params.get("filter_mode") ?? "haves") as
    | "haves"
    | "wants"
    | "both";

  const userParam = params.get("user")?.trim() ?? "";
  let userId: string | null = null;
  if (userParam) {
    const account = await db.query.cosmoAccount.findFirst({
      where: isWalletAddress(userParam)
        ? eq(cosmoAccount.address, userParam.toLowerCase())
        : ilike(cosmoAccount.nickname, userParam),
      columns: { userId: true },
    });
    if (!account) {
      return NextResponse.json(
        { trades: [], page, limit, total: 0 },
        { headers: emptyPageHeaders },
      );
    }
    userId = account.userId;
  }

  const { trades: enriched, total } = await getCached(
    `trades:list:v1:${normalizeCacheKey(params)}`,
    30_000,
    async () => {
      const { trades, total } = await listTradesPage({
        where:
          userId !== null
            ? and(eq(tradePost.status, status), eq(tradePost.userId, userId))
            : eq(tradePost.status, status),
        filters,
        filterMode,
        sort,
        page,
        limit,
      });

      return {
        total,
        trades: trades.map((t) => ({
          ...t,
          cosmoNickname: t.user.cosmoAccount?.nickname ?? null,
          cosmoAddress: t.user.cosmoAccount?.address ?? null,
        })),
      };
    },
  );

  return NextResponse.json(
    { trades: enriched, page, limit, total },
    { headers: emptyPageHeaders },
  );
}

// POST /api/trades — create a new trade post
export async function POST(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeBan = await getActiveBan(session.user.id);
  if (activeBan) {
    return NextResponse.json(
      { error: "You are trade banned and cannot perform this action." },
      { status: 403 },
    );
  }

  // Rate limit: 10 requests per 60 seconds
  const rateLimitKey = `rate-limit:create-trade:${session.user.id}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, 60);
  if (attempts > 10) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  const body = await request.json();
  const { description, haves, wants, wantsOnly } = body as {
    description?: string;
    haves: TradeItemInput[];
    wants: TradeItemInput[];
    wantsOnly?: boolean;
  };

  const sanitizedDescription = description
    ? sanitizeNoteText(description) || undefined
    : undefined;

  if (sanitizedDescription && sanitizedDescription.length > 500) {
    return NextResponse.json(
      { error: "Description must be 500 characters or less" },
      { status: 400 },
    );
  }

  if (!haves?.length || !wants?.length) {
    return NextResponse.json(
      { error: "Must have at least one 'have' and one 'want' item" },
      { status: 400 },
    );
  }

  // ANY wants must have at least one filter set (artist, member, season, or class)
  for (const w of wants) {
    if (w.isAny && !w.artist && !w.member && !w.season && !w.class) {
      return NextResponse.json(
        {
          error:
            "ANY want items must specify at least one filter (artist, member, season, or class)",
        },
        { status: 400 },
      );
    }
  }

  // Block if user has unsent objekts in an accepted trade
  const blockingTradeId = await getBlockingTradeId(session.user.id);
  if (blockingTradeId) {
    return NextResponse.json(
      {
        error:
          "You must send all your objekts in your current active trade before creating a new post",
        activeTradeId: blockingTradeId,
      },
      { status: 403 },
    );
  }

  // Check user has linked Cosmo account
  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, session.user.id),
  });
  if (!linked) {
    return NextResponse.json(
      { error: "Link your Cosmo account first" },
      { status: 403 },
    );
  }

  // Create trade post with items
  const [post] = await db
    .insert(tradePost)
    .values({
      userId: session.user.id,
      description: sanitizedDescription ?? null,
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
    })),
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
    })),
  );

  // Notify users whose open trades match the new post (fire-and-forget)
  void (async () => {
    try {
      const myHaveCollections = haves
        .filter((h) => !h.isAny)
        .map((h) => h.collectionId);
      const myWantCollections = wants
        .filter((w) => !w.isAny)
        .map((w) => w.collectionId);

      if (myHaveCollections.length === 0 || myWantCollections.length === 0)
        return;

      // Trades where someone has what we want
      const theyHaveWhatIWant = await db
        .selectDistinct({ tradePostId: tradePostHave.tradePostId })
        .from(tradePostHave)
        .where(
          and(
            inArray(tradePostHave.collectionId, myWantCollections),
            isNull(tradePostHave.deletedAt),
          ),
        );

      // Trades where someone wants what we have
      const theyWantWhatIHave = await db
        .selectDistinct({ tradePostId: tradePostWant.tradePostId })
        .from(tradePostWant)
        .where(
          and(
            inArray(tradePostWant.collectionId, myHaveCollections),
            isNull(tradePostWant.deletedAt),
          ),
        );

      const haveSet = new Set(theyHaveWhatIWant.map((r) => r.tradePostId));
      const matchingIds = theyWantWhatIHave
        .map((r) => r.tradePostId)
        .filter((id) => haveSet.has(id) && id !== post.id);

      if (matchingIds.length === 0) return;

      // Get the matching open trade posts (excluding the new poster's own trades)
      const matchingTrades = await db.query.tradePost.findMany({
        where: and(
          inArray(tradePost.id, matchingIds),
          eq(tradePost.status, "open"),
          ne(tradePost.userId, session.user.id),
        ),
        columns: { id: true, userId: true },
      });

      if (matchingTrades.length === 0) return;

      // One notification per unique user (they may have multiple matching posts)
      const uniqueUserIds = [...new Set(matchingTrades.map((t) => t.userId))];
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://objekt.my";
      const newPostUrl = `${appUrl}/trades/${post.id}`;

      await notify(
        uniqueUserIds.map((userId) => ({
          userId,
          message: `A new trade post matches yours! Check it out: ${newPostUrl}`,
          tradePostId: post.id,
        })),
      );
    } catch (err) {
      console.error("[trades/create] match notification failed:", err);
    }
  })();

  return NextResponse.json({ id: post.id }, { status: 201 });
}
