import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

const globalForDb = globalThis as unknown as {
  _dbPool: Pool;
  db: ReturnType<typeof createDb>;
};

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return value;
}

if (!globalForDb._dbPool) {
  globalForDb._dbPool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_URL?.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

export const db = globalForDb.db ?? createDb(globalForDb._dbPool);

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
