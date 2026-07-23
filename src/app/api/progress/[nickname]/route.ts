import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import {
  CosmoUnavailableError,
  resolveNickname,
  validateNickname,
} from "@/lib/cosmo/resolve-nickname";
import { indexerPool } from "@/lib/db/indexer";
import { COSMO_SPIN_ADDRESS } from "@/lib/indexer-constants";
import {
  loadCollectionMetadataByDbIds,
  loadOwnedDistinctCollectionDbIds,
} from "@/lib/indexer-owned-objekts";
import {
  isCollectionProgressCountable,
  PROGRESS_EXCLUDED_CLASS,
  PROGRESS_EXCLUDED_COLLECTION_NO,
} from "@/lib/progress/countable";
import { mergeProgressRollups } from "@/lib/progress/merge";
import {
  hasGlobalTradableCopy,
  loadCollectionTradabilityByDbId,
} from "@/lib/progress/tradability";
import { redis } from "@/lib/redis";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

type TotalsRow = {
  artist: string;
  member: string;
  class: string;
  season: string;
  onOffline: "online" | "offline";
  total: number;
};

type ProgressTotalQueryRow = {
  artist: string;
  member: string;
  class: string;
  season: string;
  on_offline: "online" | "offline";
  total: string;
};

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
    getCached("progress:totals:v4", 10 * 60_000, async () => {
      const res = await indexerPool.query<ProgressTotalQueryRow>(
        `
          select
            c.artist,
            c.member,
            c.class,
            c.season,
            c.on_offline,
            count(*)::text as total
          from collection c
          where lower(c.class) <> $1
            and upper(c.collection_no) <> $2
            and exists (
              select 1
              from objekt o
              where o.collection_id = c.id
                and o.transferable = true
                and o.owner <> $3
            )
          group by
            c.artist,
            c.member,
            c.class,
            c.season,
            c.on_offline
        `,
        [
          PROGRESS_EXCLUDED_CLASS.toLowerCase(),
          PROGRESS_EXCLUDED_COLLECTION_NO,
          COSMO_SPIN_ADDRESS,
        ],
      );
      return res.rows.map(
        (row): TotalsRow => ({
          artist: row.artist,
          member: row.member,
          class: row.class,
          season: row.season,
          onOffline: row.on_offline,
          total: Number(row.total),
        }),
      );
    }),
    getCached(`progress:owned:v5:${resolved.address}`, 90_000, async () => {
      const ownedCollectionDbIds = await loadOwnedDistinctCollectionDbIds(
        resolved.address,
      );
      const [ownedCollections, tradabilityById] = await Promise.all([
        loadCollectionMetadataByDbIds(ownedCollectionDbIds),
        loadCollectionTradabilityByDbId(ownedCollectionDbIds),
      ]);
      const rollups = new Map<
        string,
        {
          artist: string;
          member: string;
          class: string;
          season: string;
          onOffline: "online" | "offline";
          owned: number;
        }
      >();

      for (const row of ownedCollections.values()) {
        if (!isCollectionProgressCountable(row)) continue;
        if (!hasGlobalTradableCopy(tradabilityById.get(row.id))) continue;

        const key = [
          row.artist,
          row.member,
          row.class,
          row.season,
          row.onOffline,
        ].join("|");
        const existing = rollups.get(key);
        if (existing) {
          existing.owned += 1;
          continue;
        }
        rollups.set(key, {
          artist: row.artist,
          member: row.member,
          class: row.class,
          season: row.season,
          onOffline: row.onOffline,
          owned: 1,
        });
      }

      return [...rollups.values()];
    }),
  ]);

  const rollups = mergeProgressRollups(totals, owned);

  return NextResponse.json({
    nickname: resolved.nickname,
    address: resolved.address,
    rollups,
  });
}
