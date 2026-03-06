import { NextRequest, NextResponse } from "next/server";
import { requireSession, getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  tradePost,
  tradePostHave,
  tradePostWant,
  cosmoAccount,
  user,
} from "@/lib/db/schema";
import { eq, desc, and, like, inArray } from "drizzle-orm";

interface TradeItemInput {
  collectionId: string;
  member?: string;
  season?: string;
  class?: string;
  thumbnailUrl?: string;
  serial?: number;
}

// GET /api/trades — list trades with optional filters
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const member = params.get("member");
  const season = params.get("season");
  const status = params.get("status") ?? "open";
  const page = Number(params.get("page") ?? "1");
  const limit = Math.min(Number(params.get("limit") ?? "20"), 50);
  const offset = (page - 1) * limit;

  const trades = await db.query.tradePost.findMany({
    where: eq(tradePost.status, status),
    with: {
      haves: true,
      wants: true,
      user: {
        columns: { id: true, name: true, image: true },
      },
    },
    orderBy: [desc(tradePost.createdAt)],
    limit,
    offset,
  });

  // Filter by member/season if specified (post-query filter for simplicity)
  let filtered = trades;
  if (member) {
    const m = member.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.haves.some((h) => h.member?.toLowerCase().includes(m)) ||
        t.wants.some((w) => w.member?.toLowerCase().includes(m))
    );
  }
  if (season) {
    const s = season.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.haves.some((h) => h.season?.toLowerCase().includes(s)) ||
        t.wants.some((w) => w.season?.toLowerCase().includes(s))
    );
  }

  // Enrich with cosmo nickname
  const userIds = [...new Set(filtered.map((t) => t.userId))];
  const cosmoAccounts =
    userIds.length > 0
      ? await db.query.cosmoAccount.findMany({
          where: inArray(cosmoAccount.userId, userIds),
        })
      : [];

  const cosmoMap = new Map(cosmoAccounts.map((a) => [a.userId, a.nickname]));

  const enriched = filtered.map((t) => ({
    ...t,
    cosmoNickname: cosmoMap.get(t.userId) ?? null,
  }));

  return NextResponse.json({ trades: enriched, page, limit });
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
  const { description, haves, wants } = body as {
    description?: string;
    haves: TradeItemInput[];
    wants: TradeItemInput[];
  };

  if (!haves?.length || !wants?.length) {
    return NextResponse.json(
      { error: "Must have at least one 'have' and one 'want' item" },
      { status: 400 }
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
    })
    .returning();

  await db.insert(tradePostHave).values(
    haves.map((h) => ({
      tradePostId: post.id,
      collectionId: h.collectionId,
      member: h.member ?? null,
      season: h.season ?? null,
      class: h.class ?? null,
      thumbnailUrl: h.thumbnailUrl ?? null,
      serial: h.serial ?? null,
    }))
  );

  await db.insert(tradePostWant).values(
    wants.map((w) => ({
      tradePostId: post.id,
      collectionId: w.collectionId,
      member: w.member ?? null,
      season: w.season ?? null,
      class: w.class ?? null,
      thumbnailUrl: w.thumbnailUrl ?? null,
    }))
  );

  return NextResponse.json({ id: post.id }, { status: 201 });
}
