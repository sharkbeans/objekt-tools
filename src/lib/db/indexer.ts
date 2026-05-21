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
    _g._indexerPool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
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
