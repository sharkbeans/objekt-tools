import { and, asc, count, desc, inArray, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { tradePost } from "@/lib/db/schema";
import type { ObjektFilterState } from "@/lib/objekt-filters";
import { tradeMatchesFilters } from "@/lib/objekt-filters";
import { buildTradeStructuralWhere } from "@/lib/trade-filter-sql";

type FilterMode = "haves" | "wants" | "both";
type SortOrder = "newest" | "oldest";

const FILTER_BATCH_SIZE = 100;

function getTradeOrder(sort: SortOrder) {
  return sort === "oldest"
    ? [asc(tradePost.createdAt)]
    : [desc(tradePost.createdAt)];
}

// The structural EXISTS(...) conditions in `where` reference the trade_post
// table by its real name. Drizzle's relational query builder (db.query.*)
// aliases the root table (e.g. "trade_post" AS "tradePost"), which breaks
// any nested subquery that still points at the real name — so structural
// filtering always happens via a plain `db.select` id lookup first, and
// relations are hydrated afterwards by a safe `inArray(tradePost.id, ids)`.
async function fetchTradeIdsPage({
  where,
  orderBy,
  limit,
  offset,
}: {
  where?: SQL<unknown>;
  orderBy: ReturnType<typeof getTradeOrder>;
  limit: number;
  offset: number;
}): Promise<string[]> {
  const base = db.select({ id: tradePost.id }).from(tradePost);
  const filtered = where ? base.where(where) : base;
  const rows = await filtered
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);
  return rows.map((r) => r.id);
}

function reorderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const order = new Map(ids.map((id, index) => [id, index]));
  return [...rows].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}

async function fetchTradesWithRelations({
  where,
  ids,
}: {
  where?: SQL<unknown>;
  ids: string[];
}) {
  if (ids.length === 0) return [];

  const queryWhere = where
    ? and(where, inArray(tradePost.id, ids))
    : inArray(tradePost.id, ids);

  const trades = await db.query.tradePost.findMany({
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
  });

  return reorderByIds(trades, ids);
}

async function fetchTradeItemsByIds(ids: string[]) {
  if (ids.length === 0) return [];

  const rows = await db.query.tradePost.findMany({
    where: inArray(tradePost.id, ids),
    columns: { id: true },
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      wants: { where: (w, { isNull }) => isNull(w.deletedAt) },
    },
  });

  return reorderByIds(rows, ids);
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
  filters: ObjektFilterState;
  filterMode: FilterMode;
  sort: SortOrder;
  page: number;
  limit: number;
}) {
  const offset = (page - 1) * limit;
  const orderBy = getTradeOrder(sort);

  // Structural filters (artist/member/season/class/on_offline) are pushed
  // into SQL as EXISTS subqueries against trade_post_have/trade_post_want.
  const structuralWhere = buildTradeStructuralWhere(filters, filterMode);
  const combinedWhere = structuralWhere
    ? where
      ? (and(where, structuralWhere) as SQL)
      : structuralWhere
    : where;

  if (!filters.search) {
    // No text search: exact SQL pagination + count.
    const ids = await fetchTradeIdsPage({
      where: combinedWhere,
      orderBy,
      limit,
      offset,
    });

    const countQuery = db.select({ value: count() }).from(tradePost);
    const [{ value }] = combinedWhere
      ? await countQuery.where(combinedWhere)
      : await countQuery;

    const trades = await fetchTradesWithRelations({ where, ids });
    return { trades, total: value };
  }

  // Text search: the quick-search grammar (OR/AND/NOT, ranges) isn't
  // expressible in SQL, so batch-scan the SQL-prefiltered set in JS. The
  // structural EXISTS conditions above already shrink this to just the
  // structurally-matching posts.
  const searchOnlyFilters: ObjektFilterState = {
    ...filters,
    artist: [],
    member: [],
    season: [],
    class: [],
    on_offline: [],
  };

  const matchedIds: string[] = [];
  let matchedTotal = 0;
  let batchOffset = 0;

  while (true) {
    const idBatch = await fetchTradeIdsPage({
      where: combinedWhere,
      orderBy,
      limit: FILTER_BATCH_SIZE,
      offset: batchOffset,
    });

    if (idBatch.length === 0) break;

    const batch = await fetchTradeItemsByIds(idBatch);

    for (const trade of batch) {
      if (!tradeMatchesFilters(trade, searchOnlyFilters, filterMode)) continue;

      if (matchedTotal >= offset && matchedIds.length < limit) {
        matchedIds.push(trade.id);
      }

      matchedTotal += 1;
    }

    batchOffset += idBatch.length;
  }

  if (matchedIds.length === 0) {
    return { trades: [], total: matchedTotal };
  }

  const trades = await fetchTradesWithRelations({ where, ids: matchedIds });

  return { trades, total: matchedTotal };
}
