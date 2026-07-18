import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./indexer-schema";

type IndexerDb = ReturnType<typeof drizzle<typeof schema>>;

const _g = globalThis as typeof globalThis & {
  _indexerPool?: Pool;
  _indexer?: IndexerDb;
  _indexerLastRecycleMs?: number;
};

const RECYCLE_COOLDOWN_MS = 30_000;

// pg's checkout-timeout message: no client became available within
// connectionTimeoutMillis.
const CHECKOUT_TIMEOUT_MESSAGE = "timeout exceeded when trying to connect";

// The 2026-07-17/18 outages: every pool slot held by a checked-out client whose
// socket had died without the client ever being released, so the pool sat at
// max forever while holding zero live connections. Nothing inside pg reclaims
// those slots, so we do: a checkout timeout while all clients are checked out
// means the pool must be thrown away and rebuilt. totalCount === 0 instead
// means the server itself is unreachable — nothing to reclaim, don't recycle.
export function shouldRecycleOnError(
  error: unknown,
  stats: { totalCount: number; idleCount: number },
): boolean {
  if (!(error instanceof Error)) return false;
  if (!error.message.includes(CHECKOUT_TIMEOUT_MESSAGE)) return false;
  return stats.totalCount > 0 && stats.idleCount === 0;
}

function recyclePool(pool: Pool): void {
  if (_g._indexerPool !== pool) return;
  const now = Date.now();
  if (now - (_g._indexerLastRecycleMs ?? 0) < RECYCLE_COOLDOWN_MS) return;
  _g._indexerLastRecycleMs = now;
  _g._indexerPool = undefined;
  _g._indexer = undefined;
  console.warn(
    `Indexer pool exhausted by ${pool.totalCount} stuck clients; recycling pool`,
  );
  // end() resolves only after every checked-out client is released, which the
  // stuck clients never are — fire and forget so live clients can still drain.
  void pool.end().catch(() => {});
}

function attachRecycler(pool: Pool): Pool {
  const observe = (result: unknown): unknown => {
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      void (result as Promise<unknown>).catch((error: unknown) => {
        if (shouldRecycleOnError(error, pool)) recyclePool(pool);
      });
    }
    return result;
  };
  const target = pool as unknown as Record<
    "query" | "connect",
    (...args: unknown[]) => unknown
  >;
  for (const method of ["query", "connect"] as const) {
    const original = target[method].bind(pool);
    target[method] = (...args: unknown[]) => observe(original(...args));
  }
  return pool;
}

function getPool(): Pool {
  if (!_g._indexerPool) {
    const url = process.env.INDEXER_DATABASE_URL;
    if (!url) throw new Error("INDEXER_DATABASE_URL is not configured");
    const connectionTimeoutMillis = Number(
      process.env.INDEXER_CONNECTION_TIMEOUT_MS ?? 3000,
    );
    const queryTimeoutMillis = Number(
      process.env.INDEXER_QUERY_TIMEOUT_MS ?? 30000,
    );
    // The indexer is reached over the public internet, so a silently dropped
    // TCP connection (NAT/firewall pruning) would otherwise hang its query
    // forever and permanently leak the checked-out client — eight of those
    // and the pool is exhausted (attachRecycler then rebuilds it). keepAlive detects
    // dead sockets, query_timeout is the client-side backstop that destroys
    // the connection when the server can't respond at all, and
    // maxLifetimeSeconds recycles connections before middleboxes give up on
    // them. Do NOT set statement_timeout here: pg sends it as a startup
    // parameter, which the indexer's connection pooler rejects
    // ("unsupported startup parameter"), breaking every connection.
    _g._indexerPool = attachRecycler(
      new Pool({
        connectionString: url,
        max: 8,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis,
        keepAlive: true,
        query_timeout: queryTimeoutMillis,
        maxLifetimeSeconds: 300,
        ssl: url.includes("sslmode=require")
          ? { rejectUnauthorized: false }
          : undefined,
      }),
    );
  }
  return _g._indexerPool;
}

function getIndexer(): IndexerDb {
  if (!_g._indexer) {
    _g._indexer = drizzle(getPool(), { schema });
  }
  return _g._indexer;
}

// Proxy objects defer initialization to first use (request time, not import time),
// which prevents build failures when INDEXER_DATABASE_URL is absent from the build env.
export const indexerPool: Pool = new Proxy({} as Pool, {
  get(_, prop) {
    return Reflect.get(getPool(), prop);
  },
});

export const indexer: IndexerDb = new Proxy({} as IndexerDb, {
  get(_, prop) {
    return Reflect.get(getIndexer(), prop);
  },
});
