// Loads env vars before @/lib/db/indexer and @/lib/db/indexer-mirror are
// imported (both read process.env.* at module-evaluation time, not lazily).
// Using dynamic import() below — not a static import — because static
// imports are hoisted above this file's own top-level statements regardless
// of source order, so a static `import { syncIndexerMirror } from
// "@/lib/indexer-mirror-sync"` would evaluate (and capture
// process.env.MIRROR_DATABASE_URL into a Pool) before this line ever runs.
//
// Deliberately not @next/env's loadEnvConfig: it caches its result in a
// module-level variable that, in this standalone-script context (no
// surrounding Next.js process), non-deterministically returned a stale/empty
// cache and silently produced a DB pool with an undefined connection string.
// process.loadEnvFile is a plain, uncached read of the file.
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production.local"
    : ".env.development.local";
try {
  process.loadEnvFile(envFile);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// Manual/local-dev entry point for the same sync the prod cron container
// triggers via GET /api/cron/sync-indexer — see syncIndexerMirror's header
// comment in indexer-mirror-sync.ts for what this actually does and why.
// Loops until caught up (lag < overlap window) instead of a single pass, so
// this doubles as the Phase 4 bootstrap catch-up tool once the dump lands.
async function main() {
  const { syncIndexerMirror } = await import("@/lib/indexer-mirror-sync");
  const { isMirrorEnabled } = await import("@/lib/db/indexer-mirror");

  if (!isMirrorEnabled()) {
    console.error(
      "MIRROR_DATABASE_URL is not configured — nothing to sync yet.",
    );
    process.exit(1);
  }

  let iteration = 0;
  for (;;) {
    iteration += 1;
    const result = await syncIndexerMirror();
    if (result.skipped) {
      console.log(`Skipped: ${result.reason}`);
      break;
    }

    console.log(
      `[pass ${iteration}] collections: fetched ${result.collections.upsertedCount} in ${result.collections.fetchMs}ms (resumed after ${result.collections.resumedAfter ?? "beginning"})`,
    );

    // Stop once a pass fetches nothing new — caught up.
    if (result.collections.upsertedCount === 0) break;
  }
}

// This is a one-shot CLI process — Node tears down open sockets/pools on
// exit, so there's no need to explicitly end any pg.Pool here. (An earlier
// version in objekt-tcg's sync-catalog.ts called indexerPool.end() in a
// finally block; on a pool that was lazily created but never actually used,
// that await silently killed the process with no error and exit code 0,
// which is worse than not cleaning up at all.)
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Indexer mirror sync failed:", error);
    process.exit(1);
  });
