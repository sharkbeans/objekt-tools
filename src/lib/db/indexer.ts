import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./indexer-schema";

function createIndexer(pool: Pool) {
  return drizzle(pool, { schema });
}

function getIndexerDatabaseUrl() {
  const url = process.env.INDEXER_DATABASE_URL;
  if (!url) throw new Error("INDEXER_DATABASE_URL is not configured");
  return url;
}

const globalForIndexer = globalThis as unknown as {
  _indexerPool: Pool;
  indexer: ReturnType<typeof createIndexer>;
};

if (!globalForIndexer._indexerPool) {
  const connectionString = getIndexerDatabaseUrl();

  globalForIndexer._indexerPool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

export const indexerPool = globalForIndexer._indexerPool;

export const indexer =
  globalForIndexer.indexer ?? createIndexer(globalForIndexer._indexerPool);

if (process.env.NODE_ENV !== "production") globalForIndexer.indexer = indexer;
