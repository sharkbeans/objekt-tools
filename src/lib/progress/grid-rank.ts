import { indexerPool } from "@/lib/db/indexer";
import { ZERO_ADDRESS } from "@/lib/indexer-constants";
import { getCached } from "@/lib/server-cache";

export type GridRank = {
  count: number;
  rank: number | null;
  totalCrafters: number;
  percentile: number | null;
};

type CraftCountRow = {
  address: string;
  n: string;
};

/**
 * Where a single address's grid-craft count for a member/season ranks among
 * everyone who's crafted at least one grid. Shared by the grid-rank API
 * route (live UI badge) and the grid OG image, so both read the same cached
 * counts instead of duplicating the query.
 */
export async function getGridRank(
  address: string,
  member: string,
  season: string,
): Promise<GridRank> {
  const counts = await getCached(
    `grid-rank:v1:${member.toLowerCase()}:${season.toLowerCase()}`,
    10 * 60_000,
    async () => {
      const res = await indexerPool.query<CraftCountRow>(
        `
          select reward."to" as address, count(*)::text as n
          from transfer reward
          join collection c on c.id = reward.collection_id
          where reward."from" = $1
            and c.member = $2
            and c.class = 'Special'
            and c.on_offline = 'online'
            and c.season = $3
          group by address
          order by n desc
        `,
        [ZERO_ADDRESS, member, season],
      );
      return res.rows.map((row) => ({
        address: row.address.toLowerCase(),
        count: Number(row.n),
      }));
    },
  );

  const normalizedAddress = address.toLowerCase();
  const totalCrafters = counts.length;
  const mine = counts.find((c) => c.address === normalizedAddress);

  if (!mine) {
    return { count: 0, rank: null, totalCrafters, percentile: null };
  }

  // Rank ties share the same position — everyone tied at N gets the same
  // rank, no arbitrary tiebreak by address/timestamp.
  const rank = 1 + counts.filter((c) => c.count > mine.count).length;

  return {
    count: mine.count,
    rank,
    totalCrafters,
    percentile: Math.round((rank / totalCrafters) * 1000) / 10,
  };
}
