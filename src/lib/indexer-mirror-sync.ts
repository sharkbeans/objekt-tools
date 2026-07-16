import { gt, sql } from "drizzle-orm";
import { indexer } from "@/lib/db/indexer";
import {
  isMirrorEnabled,
  mirrorLocal,
  mirrorLocalPool,
} from "@/lib/db/indexer-mirror";
import { collections } from "@/lib/db/indexer-schema";

export type SyncCollectionsResult = {
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

// Idempotent: creates sync_state (cursor bookkeeping — not part of the
// restored dump) and any indexes the restore might be missing (Part 2 plan,
// Phase 5). Safe to call on every sync run; every statement is
// CREATE ... IF NOT EXISTS.
export async function ensureMirrorInfra(): Promise<void> {
  await mirrorLocalPool.query(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key text PRIMARY KEY,
      cursor_ts timestamptz,
      cursor_id varchar,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS objekt_owner_idx ON objekt (owner);
    CREATE INDEX IF NOT EXISTS objekt_collection_id_idx ON objekt (collection_id);
    CREATE UNIQUE INDEX IF NOT EXISTS collection_collection_id_idx ON collection (collection_id);
    CREATE INDEX IF NOT EXISTS collection_member_idx ON collection (member);
  `);
}

async function getCursorTs(key: string): Promise<Date | null> {
  const { rows } = await mirrorLocalPool.query<{ cursor_ts: Date | null }>(
    "SELECT cursor_ts FROM sync_state WHERE key = $1",
    [key],
  );
  return rows[0]?.cursor_ts ?? null;
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
    resumedAfter: cursorTs?.toISOString() ?? null,
    upsertedCount: rows.length,
    fetchMs,
  };
}

// Not yet implemented — Phase 0 of the Part 2 plan (inspect the arrived
// pg_dump for objekt.updated_at / received_at) determines which of Cases
// A/B/C the sync algorithm needs. Wire this in once the dump lands.
export function syncObjekts(): never {
  throw new Error(
    "syncObjekts is not implemented — pending Phase 0 (dump inspection selects the sync case)",
  );
}

// Not yet implemented — rolling `transferable` reconciliation, only needed
// for Cases B/C (see Phase 0). Wire this in alongside syncObjekts.
export function trueUpChunk(): never {
  throw new Error(
    "trueUpChunk is not implemented — pending Phase 0 (dump inspection selects the sync case)",
  );
}

// Orchestrator: the only entrypoint the cron route and CLI script should
// call. Guards on isMirrorEnabled() so this is a safe no-op-with-an-error
// before MIRROR_DATABASE_URL is set — syncCollections()/syncObjekts() write
// through `mirrorLocal`, which must never fall back to the read-only remote
// indexer pool and therefore must never run unguarded.
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
      const collectionsResult = await syncCollections();
      // syncObjekts()/trueUpChunk() intentionally not called yet — see their
      // stubs above. Once Phase 0 lands, call them here inside this same
      // locked section.
      return { skipped: false, collections: collectionsResult };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
