import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

function createDb() {
  return drizzle(process.env.DATABASE_URL!, { schema });
}

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof createDb>;
};

export const db = globalForDb.db ?? createDb();

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
