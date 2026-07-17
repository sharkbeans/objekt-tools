import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

const globalForDb = globalThis as unknown as {
  _dbPool?: Pool;
  db?: ReturnType<typeof createDb>;
};

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return value;
}

function getDb() {
  if (!globalForDb._dbPool) {
    const connectionString = getDatabaseUrl();
    const queryTimeoutMillis = Number(process.env.DB_QUERY_TIMEOUT_MS ?? 30000);
    // Same hung-connection protection as the indexer pool: a query that never
    // resolves would otherwise pin its client forever and exhaust the pool.
    // Unlike the remote indexer, this talks to our own Postgres directly, so
    // statement_timeout (server-side cancel) is safe to set here too.
    globalForDb._dbPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      query_timeout: queryTimeoutMillis,
      statement_timeout: queryTimeoutMillis,
      maxLifetimeSeconds: 300,
      ssl: connectionString.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  if (!globalForDb.db) {
    globalForDb.db = createDb(globalForDb._dbPool);
  }

  return globalForDb.db;
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, _receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
