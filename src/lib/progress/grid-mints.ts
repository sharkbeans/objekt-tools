import { indexerPool } from "@/lib/db/indexer";
import { ZERO_ADDRESS } from "@/lib/indexer-constants";
import { withIndexerFallback } from "@/lib/indexer-fallback";
import { fetchMintTransfers } from "@/lib/objekt-top-api";
import { getCachedStaleWhileRevalidate } from "@/lib/server-cache";

type GridMintCountRow = {
  collection_id: string;
  grid_mint_count: string;
};

/**
 * How many times `address` has been minted each of `member`'s grid reward
 * SCOs — the stand-in for "how many times this grid was redeemed", keyed by
 * public collectionId. A completed grid mints a Special reward from the zero
 * address. Reads the remote indexer's `transfer` table (the mirror has none),
 * cached per wallet and member for ten minutes.
 */
export async function getGridMintCounts(
  address: string,
  member: string,
): Promise<Record<string, number>> {
  const rows = await getCachedStaleWhileRevalidate(
    `progress:grid-mints:v3:${address}:${member.toLowerCase()}`,
    10 * 60_000,
    () =>
      withIndexerFallback(
        "grid mints",
        async () => {
          const result = await indexerPool.query<GridMintCountRow>(
            `
          select
            c.collection_id,
            count(*)::text as grid_mint_count
          from transfer reward
          join collection c on c.id = reward.collection_id
          where reward."from" = $1
            and reward."to" = $2
            and c.member = $3
            and c.class = 'Special'
            and c.on_offline = 'online'
          group by c.collection_id
        `,
            [ZERO_ADDRESS, address, member],
          );
          return result.rows;
        },
        () => loadGridMintCountsFromApi(address, member),
      ),
  );
  return Object.fromEntries(
    rows.map((row) => [row.collection_id, Number(row.grid_mint_count)]),
  );
}

// The same counts from objekt.top's public API while the indexer is down.
// The API's member filter also matches multi-member collections, so the
// collection's own member is checked again to keep `c.member = $3`.
async function loadGridMintCountsFromApi(
  address: string,
  member: string,
): Promise<GridMintCountRow[]> {
  const mints = await fetchMintTransfers(address, {
    member,
    class: "Special",
    onOffline: "online",
  });
  const counts = new Map<string, number>();
  for (const { transfer, objekt } of mints) {
    if (transfer.from.toLowerCase() !== ZERO_ADDRESS) continue;
    if (transfer.to.toLowerCase() !== address.toLowerCase()) continue;
    if (
      objekt.member !== member ||
      objekt.class !== "Special" ||
      objekt.onOffline !== "online"
    ) {
      continue;
    }
    counts.set(objekt.collectionId, (counts.get(objekt.collectionId) ?? 0) + 1);
  }
  return [...counts].map(([collection_id, count]) => ({
    collection_id,
    grid_mint_count: String(count),
  }));
}
