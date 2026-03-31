import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./indexer-schema";

function createIndexer() {
  return drizzle(process.env.INDEXER_DATABASE_URL!, { schema });
}

const globalForIndexer = globalThis as unknown as {
  indexer: ReturnType<typeof createIndexer>;
};

export const indexer = globalForIndexer.indexer ?? createIndexer();

if (process.env.NODE_ENV !== "production") globalForIndexer.indexer = indexer;
