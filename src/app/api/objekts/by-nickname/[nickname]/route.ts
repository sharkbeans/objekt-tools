import { and, asc, eq, ilike } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { fetchUserByNickname } from "@/lib/cosmo/client";
import { db } from "@/lib/db";
import { indexer } from "@/lib/db/indexer";
import { collections, objekts } from "@/lib/db/indexer-schema";
import { cosmoAccount } from "@/lib/db/schema";
import { redis } from "@/lib/redis";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

// GET /api/objekts/by-nickname/[nickname]
// Resolves a Cosmo nickname to a wallet address and returns their transferable objekts.
// No auth required — rate limited by IP (10 req/min unauthed, 60 req/min authed).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nickname: string }> },
) {
  const { nickname } = await params;

  if (!nickname || nickname.length < 1) {
    return NextResponse.json({ error: "Nickname required" }, { status: 400 });
  }

  const session = await getSession();

  // Rate limiting
  const rateLimitId = session?.user.id
    ? `user:${session.user.id}`
    : `ip:${request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"}`;
  const rateLimitKey = `rate-limit:by-nickname:${rateLimitId}`;
  const limit = session ? 60 : 10;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, 60);
  if (attempts > limit) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  // Resolve nickname → address: try our DB first, fall back to Cosmo API
  let address: string | null = null;

  const linked = await db.query.cosmoAccount.findFirst({
    where: ilike(cosmoAccount.nickname, nickname),
    columns: { address: true },
  });

  if (linked) {
    address = linked.address;
  } else {
    const resolved = await fetchUserByNickname(nickname);
    if (!resolved) {
      return NextResponse.json(
        { error: "Cosmo user not found" },
        { status: 404 },
      );
    }
    address = resolved.address.toLowerCase();
  }

  const rows = await getCached(
    `objekts:nickname:v1:${address.toLowerCase()}`,
    90_000,
    () =>
      indexer
        .select({
          collectionId: collections.collectionId,
          artist: collections.artist,
          member: collections.member,
          collectionNo: collections.collectionNo,
          season: collections.season,
          class: collections.class,
          thumbnailImage: collections.thumbnailImage,
          serial: objekts.serial,
          objektId: objekts.id,
        })
        .from(objekts)
        .innerJoin(collections, eq(objekts.collectionId, collections.id))
        .where(and(eq(objekts.owner, address), eq(objekts.transferable, true)))
        .orderBy(asc(collections.member), asc(collections.collectionNo))
        .limit(500),
  );

  const results = rows.map((r) => ({
    collectionId: r.collectionId,
    artist: r.artist,
    member: r.member,
    collectionNo: r.collectionNo,
    season: r.season,
    class: r.class,
    thumbnailImage: r.thumbnailImage,
    serial: r.serial,
    objektId: r.objektId,
  }));

  return NextResponse.json({ results, address });
}
