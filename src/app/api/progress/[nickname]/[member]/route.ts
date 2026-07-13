import { count, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { normalizeArtistId } from "@/lib/artist-utils";
import { getSession } from "@/lib/auth-server";
import {
  CosmoUnavailableError,
  resolveNickname,
  validateNickname,
} from "@/lib/cosmo/resolve-nickname";
import { indexer, indexerPool } from "@/lib/db/indexer";
import { collections, objekts } from "@/lib/db/indexer-schema";
import { compareSeasons } from "@/lib/filter-options";
import { membersByArtist } from "@/lib/filters";
import { COSMO_SPIN_ADDRESS, ZERO_ADDRESS } from "@/lib/indexer-constants";
import type { ProgressCollection } from "@/lib/progress/types";
import { redis } from "@/lib/redis";
import { getCached } from "@/lib/server-cache";

type GridMintCountRow = {
  collection_id: string;
  grid_mint_count: string;
};

export const dynamic = "force-dynamic";

const allMembers = new Set(Object.values(membersByArtist).flat());

function artistForMember(member: string): string {
  for (const [artist, members] of Object.entries(membersByArtist)) {
    if (members.includes(member)) return normalizeArtistId(artist);
  }
  return "";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nickname: string; member: string }> },
) {
  const { nickname, member } = await params;

  if (!nickname || !validateNickname(nickname)) {
    return NextResponse.json({ error: "Invalid nickname" }, { status: 400 });
  }

  if (!member || !allMembers.has(member)) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
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

  const [allCollections, ownedCounts, gridMintCounts] = await Promise.all([
    getCached(
      `progress:collections:v3:${member.toLowerCase()}`,
      10 * 60_000,
      () =>
        indexer
          .select({
            id: collections.id,
            collectionId: collections.collectionId,
            collectionNo: collections.collectionNo,
            season: collections.season,
            class: collections.class,
            onOffline: collections.onOffline,
            thumbnailImage: collections.thumbnailImage,
            frontImage: collections.frontImage,
            backImage: collections.backImage,
            accentColor: collections.accentColor,
          })
          .from(collections)
          .where(eq(collections.member, member)),
    ),
    getCached(
      `progress:owned-detail:v2:${resolved.address}:${member.toLowerCase()}`,
      90_000,
      () =>
        indexer
          .select({
            collectionId: objekts.collectionId,
            ownedCount: count(),
            transferableCount:
              sql<number>`count(*) filter (where ${objekts.transferable})`.mapWith(
                Number,
              ),
          })
          .from(objekts)
          .innerJoin(collections, eq(objekts.collectionId, collections.id))
          .where(eq(objekts.owner, resolved.address))
          .groupBy(objekts.collectionId),
    ),
    // Gridding has no dedicated flag in the indexer. A completed grid mints a
    // reward Special-class objekt to the wallet from the zero address; we
    // count those mints (excluding spin rewards, which are also zero-address
    // Special mints) as a proxy for "times gridded". This stays accurate
    // even if the reward SCO is later traded away, and doesn't miscount
    // event-drop FCOs (which are ownership, not mints, of Specials).
    getCached(
      `progress:grid-mints:v1:${resolved.address}:${member.toLowerCase()}`,
      90_000,
      async () => {
        const res = await indexerPool.query<GridMintCountRow>(
          `
            select
              c.id as collection_id,
              count(*)::text as grid_mint_count
            from transfer reward
            join collection c on c.id = reward.collection_id
            where reward."from" = $1
              and reward."to" = $2
              and c.member = $3
              and c.class = 'Special'
              and c.on_offline = 'online'
              and not exists (
                select 1
                from transfer spin_send
                where spin_send."to" = $4
                  and spin_send."from" = reward."to"
                  and reward.timestamp >= spin_send.timestamp
                  and reward.timestamp <= spin_send.timestamp + interval '10 minutes'
              )
            group by c.id
          `,
          [ZERO_ADDRESS, resolved.address, member, COSMO_SPIN_ADDRESS],
        );
        return res.rows;
      },
    ),
  ]);

  const ownedMap = new Map<string, number>();
  const transferableMap = new Map<string, number>();
  for (const row of ownedCounts) {
    if (row.collectionId) {
      ownedMap.set(row.collectionId, row.ownedCount);
      transferableMap.set(row.collectionId, row.transferableCount);
    }
  }

  const gridMintMap = new Map<string, number>();
  for (const row of gridMintCounts) {
    gridMintMap.set(row.collection_id, Number(row.grid_mint_count));
  }

  // A/Z dedup: collectionNo like "101A" and "101Z" are the same physical card.
  // Group by (season, numeric prefix). Prefer Z; show A only if no Z exists.
  type RawCollection = (typeof allCollections)[number];
  const azGroups = new Map<
    string,
    { a?: RawCollection; z?: RawCollection; other?: RawCollection }
  >();
  for (const c of allCollections) {
    const noUpper = c.collectionNo.toUpperCase();
    if (noUpper.endsWith("A") || noUpper.endsWith("Z")) {
      const base = `${c.season}::${noUpper.slice(0, -1)}`;
      const entry = azGroups.get(base) ?? {};
      if (noUpper.endsWith("Z")) entry.z = c;
      else entry.a = c;
      azGroups.set(base, entry);
    } else {
      const base = `${c.season}::${noUpper}`;
      const entry = azGroups.get(base) ?? {};
      entry.other = c;
      azGroups.set(base, entry);
    }
  }

  const deduped: RawCollection[] = [];
  for (const entry of azGroups.values()) {
    if (entry.other) {
      deduped.push(entry.other);
    } else {
      // Prefer Z; fall back to A
      const pick = entry.z ?? entry.a;
      if (pick) deduped.push(pick);
    }
  }

  const artist = artistForMember(member);

  const result: ProgressCollection[] = deduped
    .map((c) => ({
      collectionId: c.collectionId,
      collectionNo: c.collectionNo,
      season: c.season,
      class: c.class,
      onOffline: c.onOffline,
      thumbnailImage: c.thumbnailImage,
      frontImage: c.frontImage,
      backImage: c.backImage,
      accentColor: c.accentColor,
      member,
      artist,
      ownedCount: ownedMap.get(c.id) ?? 0,
      transferableCount: transferableMap.get(c.id) ?? 0,
      gridMintCount: gridMintMap.get(c.id) ?? 0,
    }))
    .sort((a, b) => {
      const sc = compareSeasons(a.season, b.season);
      if (sc !== 0) return sc;
      return a.collectionNo.localeCompare(b.collectionNo, undefined, {
        numeric: true,
      });
    });

  return NextResponse.json({
    nickname: resolved.nickname,
    address: resolved.address,
    member,
    artist,
    collections: result,
  });
}
