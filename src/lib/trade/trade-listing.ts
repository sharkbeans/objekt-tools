import { and, asc, count, desc, inArray, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { tradePost } from "@/lib/db/schema";
import {
  hasAnyFilter,
  type TradeFilters,
  tradeMatchesFilters,
} from "@/lib/filter-utils";

type FilterMode = "haves" | "wants" | "both";
type SortOrder = "newest" | "oldest";

const FILTER_BATCH_SIZE = 100;

function getTradeOrder(sort: SortOrder) {
  return sort === "oldest"
    ? [asc(tradePost.createdAt)]
    : [desc(tradePost.createdAt)];
}

async function fetchTradesWithRelations({
  where,
  orderBy,
  limit,
  offset,
  ids,
}: {
  where?: SQL<unknown>;
  orderBy?: ReturnType<typeof getTradeOrder>;
  limit?: number;
  offset?: number;
  ids?: string[];
}) {
  const queryWhere = ids
    ? where
      ? and(where, inArray(tradePost.id, ids))
      : inArray(tradePost.id, ids)
    : where;

  return db.query.tradePost.findMany({
    where: queryWhere,
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      wants: { where: (w, { isNull }) => isNull(w.deletedAt) },
      user: {
        columns: { id: true, name: true, image: true },
        with: {
          cosmoAccount: {
            columns: { nickname: true, address: true },
          },
        },
      },
    },
    ...(orderBy ? { orderBy } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
  });
}

async function fetchTradeFilterBatch({
  where,
  orderBy,
  offset,
}: {
  where?: SQL<unknown>;
  orderBy: ReturnType<typeof getTradeOrder>;
  offset: number;
}) {
  return db.query.tradePost.findMany({
    where,
    columns: { id: true },
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      wants: { where: (w, { isNull }) => isNull(w.deletedAt) },
    },
    orderBy,
    limit: FILTER_BATCH_SIZE,
    offset,
  });
}

export async function listTradesPage({
  where,
  filters,
  filterMode,
  sort,
  page,
  limit,
}: {
  where?: SQL<unknown>;
  filters: TradeFilters;
  filterMode: FilterMode;
  sort: SortOrder;
  page: number;
  limit: number;
}) {
  const offset = (page - 1) * limit;
  const orderBy = getTradeOrder(sort);

  if (!hasAnyFilter(filters)) {
    const trades = await fetchTradesWithRelations({
      where,
      orderBy,
      limit,
      offset,
    });

    const countQuery = db.select({ value: count() }).from(tradePost);
    const [{ value }] = where
      ? await countQuery.where(where)
      : await countQuery;

    return { trades, total: value };
  }

  const matchedIds: string[] = [];
  let matchedTotal = 0;
  let batchOffset = 0;

  while (true) {
    const batch = await fetchTradeFilterBatch({
      where,
      orderBy,
      offset: batchOffset,
    });

    if (batch.length === 0) break;

    for (const trade of batch) {
      if (!tradeMatchesFilters(trade, filters, filterMode)) continue;

      if (matchedTotal >= offset && matchedIds.length < limit) {
        matchedIds.push(trade.id);
      }

      matchedTotal += 1;
    }

    batchOffset += batch.length;
  }

  if (matchedIds.length === 0) {
    return { trades: [], total: matchedTotal };
  }

  const trades = await fetchTradesWithRelations({
    where,
    ids: matchedIds,
  });

  const order = new Map(matchedIds.map((id, index) => [id, index]));
  trades.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { trades, total: matchedTotal };
}
