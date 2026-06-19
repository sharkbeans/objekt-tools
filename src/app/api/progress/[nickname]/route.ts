import { count, countDistinct, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import {
  CosmoUnavailableError,
  resolveNickname,
  validateNickname,
} from "@/lib/cosmo/resolve-nickname";
import { indexer } from "@/lib/db/indexer";
import { collections, objekts } from "@/lib/db/indexer-schema";
import { mergeProgressRollups } from "@/lib/progress/merge";
import { redis } from "@/lib/redis";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nickname: string }> },
) {
  const { nickname } = await params;

  if (!nickname || !validateNickname(nickname)) {
    return NextResponse.json({ error: "Invalid nickname" }, { status: 400 });
  }

  const session = await getSession();
  const rateLimitId = session?.user.id
    ? `user:${session.user.id}`
    : `ip:${request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"}`;
  const rateLimitKey = `rate-limit:progress:${rateLimitId}`;
  const limit = session ? 60 : 10;
  try {
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) await redis.expire(rateLimitKey, 60);
    if (attempts > limit) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 },
      );
    }
  } catch {
    // Redis unavailable — skip rate limiting
  }

  let resolved: Awaited<ReturnType<typeof resolveNickname>>;
  try {
    resolved = await resolveNickname(nickname);
  } catch (error) {
    if (error instanceof CosmoUnavailableError) {
      return NextResponse.json(
        { error: "Cosmo is temporarily unavailable. Try again later." },
        { status: 503 },
      );
    }
    throw error;
  }
  if (!resolved) {
    return NextResponse.json(
      { error: "Cosmo user not found" },
      { status: 404 },
    );
  }

  const [totals, owned] = await Promise.all([
    getCached("progress:totals:v2", 10 * 60_000, () =>
      indexer
        .select({
          artist: collections.artist,
          member: collections.member,
          class: collections.class,
          season: collections.season,
          onOffline: collections.onOffline,
          total: count(),
        })
        .from(collections)
        .groupBy(
          collections.artist,
          collections.member,
          collections.class,
          collections.season,
          collections.onOffline,
        ),
    ),
    getCached(`progress:owned:v2:${resolved.address}`, 90_000, () =>
      indexer
        .select({
          artist: collections.artist,
          member: collections.member,
          class: collections.class,
          season: collections.season,
          onOffline: collections.onOffline,
          owned: countDistinct(objekts.collectionId),
        })
        .from(objekts)
        .innerJoin(collections, eq(objekts.collectionId, collections.id))
        .where(eq(objekts.owner, resolved.address))
        .groupBy(
          collections.artist,
          collections.member,
          collections.class,
          collections.season,
          collections.onOffline,
        ),
    ),
  ]);

  const rollups = mergeProgressRollups(totals, owned);

  return NextResponse.json({
    nickname: resolved.nickname,
    address: resolved.address,
    rollups,
  });
}
