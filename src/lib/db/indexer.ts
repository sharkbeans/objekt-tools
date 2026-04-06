import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./indexer-schema";

const globalForIndexer = globalThis as unknown as {
  _indexerPool: Pool;
  indexer: ReturnType<typeof drizzle>;
};

if (!globalForIndexer._indexerPool) {
  globalForIndexer._indexerPool = new Pool({
    connectionString: process.env.INDEXER_DATABASE_URL!,
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.INDEXER_DATABASE_URL?.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

export const indexer =
  globalForIndexer.indexer ?? drizzle(globalForIndexer._indexerPool, { schema });

if (process.env.NODE_ENV !== "production") globalForIndexer.indexer = indexer;
