import { gt, sql } from "drizzle-orm";
import { indexer } from "@/lib/db/indexer";
import {
  isMirrorEnabled,
  mirrorLocal,
  mirrorLocalPool,
} from "@/lib/db/indexer-mirror";
import { collections } from "@/lib/db/indexer-schema";
import {
  describeError,
  isApiFallbackEnabled,
  markIndexerFailed,
} from "@/lib/indexer-fallback";
import {
  fetchCollectionsIfModified,
  type ObjektTopCollection,
} from "@/lib/objekt-top-api";

export type SyncCollectionsResult = {
  source: "indexer" | "objekt-top-api";
  resumedAfter: string | null;
  upsertedCount: number;
  fetchMs: number;
};

export type SyncIndexerMirrorResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      collections: SyncCollectionsResult;
    };

// Arbitrary but stable 32-bit key for the session-level advisory lock guarding
// syncIndexerMirror() against overlapping cron/CLI runs.
const ADVISORY_LOCK_KEY = 0x494d5359; // "IMSY" (Indexer Mirror SYnc)

// Idempotent: creates the collection-only mirror schema plus sync_state
// cursor bookkeeping. Safe to call on every sync run; every statement is
// CREATE ... IF NOT EXISTS.
export async function ensureMirrorInfra(): Promise<void> {
  await mirrorLocalPool.query(`
    CREATE TABLE IF NOT EXISTS collection (
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
      accent_color text NOT NULL,
      on_offline text NOT NULL,
      created_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_state (
      key text PRIMARY KEY,
      cursor_ts timestamptz,
      cursor_id varchar,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS collection_collection_id_idx ON collection (collection_id);
    CREATE INDEX IF NOT EXISTS collection_member_idx ON collection (member);
    CREATE INDEX IF NOT EXISTS collection_artist_idx ON collection (artist);
    CREATE INDEX IF NOT EXISTS collection_created_at_idx ON collection (created_at);
  `);
}

async function getCursorTs(key: string): Promise<Date | null> {
  const { rows } = await mirrorLocalPool.query<{ cursor_ts: Date | null }>(
    "SELECT cursor_ts FROM sync_state WHERE key = $1",
    [key],
  );
  return rows[0]?.cursor_ts ?? null;
}

async function getCursorId(key: string): Promise<string | null> {
  const { rows } = await mirrorLocalPool.query<{ cursor_id: string | null }>(
    "SELECT cursor_id FROM sync_state WHERE key = $1",
    [key],
  );
  return rows[0]?.cursor_id ?? null;
}

async function setCursorId(key: string, cursorId: string): Promise<void> {
  await mirrorLocalPool.query(
    `INSERT INTO sync_state (key, cursor_id, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET cursor_id = excluded.cursor_id, updated_at = excluded.updated_at`,
    [key, cursorId],
  );
}

async function setCursorTs(key: string, cursorTs: Date): Promise<void> {
  await mirrorLocalPool.query(
    `INSERT INTO sync_state (key, cursor_ts, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET cursor_ts = excluded.cursor_ts, updated_at = excluded.updated_at`,
    [key, cursorTs],
  );
}

const COLLECTION_BATCH_SIZE = 500;

// Incremental sync of the remote indexer's `collection` table into the local
// mirror. Cursor = collection.created_at (confirmed indexed on the remote —
// objekt-tcg's catalog-sync already relies on this column against the same
// indexer DB). Collection metadata is effectively immutable once minted, so —
// like objekt-tcg — this won't catch the indexer correcting an existing row
// in place; a full backfill is always available by deleting sync_state's
// 'collection' row and rerunning. Unlike objekt-tcg's sync, this upserts
// every column including on_offline.
export async function syncCollections(): Promise<SyncCollectionsResult> {
  const cursorTs = await getCursorTs("collection");

  const start = Date.now();
  const query = indexer.select().from(collections);
  const rows = cursorTs
    ? await query.where(gt(collections.createdAt, cursorTs))
    : await query;
  const fetchMs = Date.now() - start;

  if (rows.length === 0) {
    return {
      source: "indexer",
      resumedAfter: cursorTs?.toISOString() ?? null,
      upsertedCount: 0,
      fetchMs,
    };
  }

  for (let i = 0; i < rows.length; i += COLLECTION_BATCH_SIZE) {
    const batch = rows.slice(i, i + COLLECTION_BATCH_SIZE);
    await mirrorLocal
      .insert(collections)
      .values(batch)
      .onConflictDoUpdate({
        target: collections.id,
        set: {
          collectionId: sql`excluded.collection_id`,
          season: sql`excluded.season`,
          member: sql`excluded.member`,
          artist: sql`excluded.artist`,
          collectionNo: sql`excluded.collection_no`,
          class: sql`excluded.class`,
          thumbnailImage: sql`excluded.thumbnail_image`,
          frontImage: sql`excluded.front_image`,
          backImage: sql`excluded.back_image`,
          accentColor: sql`excluded.accent_color`,
          onOffline: sql`excluded.on_offline`,
          createdAt: sql`excluded.created_at`,
        },
      });
  }

  const newCursorTs = rows.reduce(
    (max, r) => (r.createdAt > max ? r.createdAt : max),
    cursorTs ?? rows[0].createdAt,
  );
  await setCursorTs("collection", newCursorTs);

  return {
    source: "indexer",
    resumedAfter: cursorTs?.toISOString() ?? null,
    upsertedCount: rows.length,
    fetchMs,
  };
}

// The objekt.top API's Last-Modified for /collections, kept in sync_state's
// cursor_id so each run sends a conditional request and normally gets an
// empty 304 back.
const API_STATE_KEY = "collection-objekt-top-api";

/**
 * Maps an objekt.top API collection to a mirror row. The API serves its own
 * re-encoded images (media.objekt.top) and the original Cosmo URLs only for
 * the front and back, and has no accent colour: the front and back use the
 * originals, the thumbnail uses objekt.top's copy, and the accent colour is
 * left empty, which every reader already treats as "none".
 */
export function toMirrorCollectionRow(
  collection: ObjektTopCollection,
): typeof collections.$inferInsert {
  return {
    id: collection.id,
    collectionId: collection.collectionId,
    season: collection.season,
    member: collection.member,
    artist: collection.artist,
    collectionNo: collection.collectionNo,
    class: collection.class,
    thumbnailImage: collection.thumbnailImage,
    frontImage: collection.originalFrontImage || collection.frontImage,
    backImage: collection.originalBackImage || collection.backImage,
    accentColor: "",
    onOffline: collection.onOffline,
    createdAt: new Date(collection.createdAt),
  };
}

// Used while the indexer is unreachable. Only inserts collections the mirror
// lacks and never touches the indexer cursor, so once the indexer is back,
// syncCollections() resumes where it stopped and its upsert replaces these
// rows with the indexer's own (original thumbnail, accent colour).
export async function syncCollectionsFromApi(): Promise<SyncCollectionsResult> {
  const lastModified = await getCursorId(API_STATE_KEY);

  const start = Date.now();
  const result = await fetchCollectionsIfModified(lastModified);
  const fetchMs = Date.now() - start;

  if (result.notModified) {
    return {
      source: "objekt-top-api",
      resumedAfter: lastModified,
      upsertedCount: 0,
      fetchMs,
    };
  }

  const rows = result.collections.map(toMirrorCollectionRow);
  let insertedCount = 0;
  for (let i = 0; i < rows.length; i += COLLECTION_BATCH_SIZE) {
    const inserted = await mirrorLocal
      .insert(collections)
      .values(rows.slice(i, i + COLLECTION_BATCH_SIZE))
      .onConflictDoNothing()
      .returning({ id: collections.id });
    insertedCount += inserted.length;
  }

  if (result.lastModified) {
    await setCursorId(API_STATE_KEY, result.lastModified);
  }

  return {
    source: "objekt-top-api",
    resumedAfter: lastModified,
    upsertedCount: insertedCount,
    fetchMs,
  };
}

async function syncCollectionsWithFallback(): Promise<SyncCollectionsResult> {
  try {
    return await syncCollections();
  } catch (error) {
    if (!isApiFallbackEnabled()) throw error;
    markIndexerFailed(error);
    console.warn(
      `Indexer collection sync failed (${describeError(error)}); adding new collections from the objekt.top API instead`,
    );
    return syncCollectionsFromApi();
  }
}

// Orchestrator: the only entrypoint the cron route and CLI script should
// call. Guards on isMirrorEnabled() so this is a safe no-op-with-an-error
// before MIRROR_DATABASE_URL is set — syncCollections() writes through
// `mirrorLocal`, which must never fall back to the read-only remote indexer
// pool and therefore must never run unguarded.
export async function syncIndexerMirror(): Promise<SyncIndexerMirrorResult> {
  if (!isMirrorEnabled()) {
    throw new Error("MIRROR_DATABASE_URL is not configured");
  }

  const client = await mirrorLocalPool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [ADVISORY_LOCK_KEY],
    );
    if (!rows[0]?.locked) {
      return { skipped: true, reason: "sync already in progress" };
    }

    try {
      await ensureMirrorInfra();
      const collectionsResult = await syncCollectionsWithFallback();
      return { skipped: false, collections: collectionsResult };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
