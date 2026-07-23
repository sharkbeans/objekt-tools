import { indexerPool } from "@/lib/db/indexer";
import { COSMO_SPIN_ADDRESS } from "@/lib/indexer-constants";

export type CollectionTradability = {
  totalCount: number;
  tradableCount: number;
};

type TradabilityRow = {
  collection_id: string;
  total_count: string;
  tradable_count: string;
};

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export async function loadCollectionTradabilityByDbId(
  collectionDbIds: string[],
): Promise<Map<string, CollectionTradability>> {
  const uniqueIds = uniqueStrings(collectionDbIds);
  if (uniqueIds.length === 0) return new Map();

  const res = await indexerPool.query<TradabilityRow>(
    `
      select
        collection_id,
        count(*)::text as total_count,
        count(*) filter (
          where transferable = true
            and owner <> $2
        )::text as tradable_count
      from objekt
      where collection_id = any($1::uuid[])
      group by collection_id
    `,
    [uniqueIds, COSMO_SPIN_ADDRESS],
  );

  return new Map(
    res.rows.map((row) => [
      row.collection_id,
      {
        totalCount: Number(row.total_count),
        tradableCount: Number(row.tradable_count),
      },
    ]),
  );
}

export function hasGlobalTradableCopy(
  tradability: CollectionTradability | undefined,
): boolean {
  return (tradability?.tradableCount ?? 0) > 0;
}
