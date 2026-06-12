export const hasTestDb = Boolean(
  process.env.TEST_DATABASE_URL && process.env.TEST_INDEXER_DATABASE_URL,
);

export function setupTestEnv() {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.INDEXER_DATABASE_URL = process.env.TEST_INDEXER_DATABASE_URL!;
  if (process.env.TEST_REDIS_URL) {
    process.env.REDIS_URL = process.env.TEST_REDIS_URL;
  }
  process.env.CRON_SECRET = "test-cron-secret";
  delete process.env.DISCORD_BOT_TOKEN;
}

export async function getDb() {
  const { db } = await import("@/lib/db");
  return db;
}

export async function migrateAppDb() {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const db = await getDb();
  await migrate(db, { migrationsFolder: "drizzle" });
}

const INDEXER_DDL = `
  CREATE TABLE IF NOT EXISTS "collection" (
    id uuid PRIMARY KEY,
    collection_id text NOT NULL,
    season text NOT NULL,
    member text NOT NULL,
    artist text NOT NULL,
    collection_no text NOT NULL,
    class text NOT NULL,
    thumbnail_image text NOT NULL,
    front_image text NOT NULL,
    back_image text NOT NULL,
    on_offline text NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "objekt" (
    id varchar PRIMARY KEY,
    owner text NOT NULL,
    serial integer NOT NULL,
    transferable boolean NOT NULL,
    collection_id uuid REFERENCES "collection"(id)
  );
  CREATE TABLE IF NOT EXISTS "transfer" (
    id varchar(36) PRIMARY KEY,
    "from" text NOT NULL,
    "to" text NOT NULL,
    "timestamp" timestamptz NOT NULL,
    token_id text NOT NULL,
    hash text NOT NULL,
    objekt_id varchar REFERENCES "objekt"(id),
    collection_id uuid REFERENCES "collection"(id)
  );
`;

export async function createIndexerTables() {
  const { indexerPool } = await import("@/lib/db/indexer");
  await indexerPool.query(INDEXER_DDL);
}

type PoolLike = {
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
};

export async function resetDb() {
  const g = globalThis as unknown as {
    _dbPool?: PoolLike;
    _indexerPool?: PoolLike;
  };
  if (g._dbPool) {
    await g._dbPool.query(`
      TRUNCATE TABLE
        trade_ban, trade_transfer_log, active_trade_side, active_trade,
        trade_notification, poster_want, poster_have, poster,
        trade_post_have, trade_post_want, trade_post,
        cosmo_token, cosmo_account, session, account, verification, "user"
      RESTART IDENTITY CASCADE
    `);
  }
  if (g._indexerPool) {
    await g._indexerPool.query(
      `TRUNCATE TABLE transfer, objekt, collection RESTART IDENTITY CASCADE`,
    );
  }
}

let _teardownDone = false;

export async function teardown() {
  if (_teardownDone) return;
  _teardownDone = true;
  const g = globalThis as unknown as {
    _dbPool?: PoolLike;
    _indexerPool?: PoolLike;
  };
  await g._dbPool?.end();
  await g._indexerPool?.end();
  try {
    const { redis } = await import("@/lib/redis");
    await redis.quit();
  } catch {
    // redis may not have been initialised
  }
}
