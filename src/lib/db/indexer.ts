import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./indexer-schema";

const globalForIndexer = globalThis as unknown as {
  indexer: ReturnType<typeof drizzle>;
};

export const indexer =
  globalForIndexer.indexer ??
  drizzle(process.env.INDEXER_DATABASE_URL!, { schema });

if (process.env.NODE_ENV !== "production") globalForIndexer.indexer = indexer;
