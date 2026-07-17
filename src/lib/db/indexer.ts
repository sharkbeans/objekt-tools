import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./indexer-schema";

type IndexerDb = ReturnType<typeof drizzle<typeof schema>>;

const _g = globalThis as typeof globalThis & {
  _indexerPool?: Pool;
  _indexer?: IndexerDb;
};

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
    // and the pool is exhausted until the process restarts. keepAlive detects
    // dead sockets, query_timeout is the client-side backstop that destroys
    // the connection when the server can't respond at all, and
    // maxLifetimeSeconds recycles connections before middleboxes give up on
    // them. Do NOT set statement_timeout here: pg sends it as a startup
    // parameter, which the indexer's connection pooler rejects
    // ("unsupported startup parameter"), breaking every connection.
    _g._indexerPool = new Pool({
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
    });
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
