import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  _dbPool: Pool;
  db: ReturnType<typeof drizzle>;
};

if (!globalForDb._dbPool) {
  globalForDb._dbPool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_URL?.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

export const db =
  globalForDb.db ?? drizzle(globalForDb._dbPool, { schema });

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
