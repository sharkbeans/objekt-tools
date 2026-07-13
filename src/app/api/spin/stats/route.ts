import { NextResponse } from "next/server";
import { indexerPool } from "@/lib/db/indexer";
import { COSMO_SPIN_ADDRESS, ZERO_ADDRESS } from "@/lib/indexer-constants";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const spinRewardLines = [
  { artistKey: "triples", artist: "tripleS", className: "First" },
  { artistKey: "triples", artist: "tripleS", className: "Special" },
  { artistKey: "triples", artist: "tripleS", className: "Premier" },
  { artistKey: "artms", artist: "ARTMS", className: "First" },
  { artistKey: "artms", artist: "ARTMS", className: "Special" },
  { artistKey: "artms", artist: "ARTMS", className: "Premier" },
  { artistKey: "idntt", artist: "idntt", className: "Basic" },
  { artistKey: "idntt", artist: "idntt", className: "Special" },
  { artistKey: "idntt", artist: "idntt", className: "Unit" },
];

type SpinRewardCountRow = {
  artist: string;
  class_name: string;
  recipients: string;
};

export async function GET() {
  try {
    const results = await getCached("spin:stats:v2", 5 * 60_000, async () => {
      const rewardResult = await indexerPool.query<SpinRewardCountRow>(
        `
          with day_start as (
            select (
              date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur')
              at time zone 'Asia/Kuala_Lumpur'
            ) as start_at
          ),
          matched_rewards as (
            select
              c.artist,
              c.class as class_name,
              lower(reward.to) as recipient
            from transfer reward
            join collection c on c.id = reward.collection_id
            cross join day_start
            where reward.from = $1
              and reward.timestamp >= day_start.start_at
              and (
                (c.artist = 'triples' and c.class in ('First', 'Special', 'Premier'))
                or (c.artist = 'artms' and c.class in ('First', 'Special', 'Premier'))
                or (c.artist = 'idntt' and c.class in ('Basic', 'Special', 'Unit'))
              )
              and exists (
                select 1
                from transfer spin_send
                where spin_send.to = $2
                  and spin_send.timestamp >= day_start.start_at
                  and lower(spin_send.from) = lower(reward.to)
                  and reward.timestamp >= spin_send.timestamp
                  and reward.timestamp <= spin_send.timestamp + interval '10 minutes'
              )
          )
          select
            artist,
            class_name,
            count(distinct recipient)::text as recipients
          from matched_rewards
          group by artist, class_name
        `,
        [ZERO_ADDRESS, COSMO_SPIN_ADDRESS],
      );

      const recipientsByLine = new Map(
        rewardResult.rows.map((row) => [
          `${row.artist}:${row.class_name}`,
          Number(row.recipients),
        ]),
      );

      return spinRewardLines.map((line) => ({
        artist: line.artist,
        className: line.className,
        recipients:
          recipientsByLine.get(`${line.artistKey}:${line.className}`) ?? 0,
      }));
    });

    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
        },
      },
    );
  } catch (error) {
    console.warn("Failed to load spin stats", error);
    return NextResponse.json(
      { error: "Failed to load spin stats", results: [] },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
