import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { db: ReturnType<typeof drizzle> };

export const db =
  globalForDb.db ?? drizzle(process.env.DATABASE_URL!, { schema });

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
