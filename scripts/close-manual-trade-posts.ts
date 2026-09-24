/**
 * Close open manual trade posts ahead of the trades retirement (plan 039,
 * stage A step 4).
 *
 * Closes every trade post with source = 'manual' AND status = 'open' that is
 * NOT referenced (as tradePostId or matchedTradePostId) by an active trade
 * that is still in flight (pending / accepted / partial) — those finish or
 * expire through the normal flow. "list" posts (poster mirrors — the Lists
 * matching index) are never touched.
 *
 * Each affected user gets ONE notification (site + best-effort Discord DM):
 * "Trades is retiring, so your trade post was closed. Your Lists still match."
 *
 * Dry-run by default: prints what would change and writes nothing.
 *
 * Usage:
 *   npx tsx scripts/close-manual-trade-posts.ts            # dry run
 *   npx tsx scripts/close-manual-trade-posts.ts --apply    # write + notify
 *
 * Reads DATABASE_URL (+ REDIS_URL / DISCORD_BOT_TOKEN for --apply's DMs) from
 * the environment, or from .env.development.local (.env.production.local when
 * NODE_ENV=production). Safe to re-run: the UPDATE re-checks every condition,
 * so a second --apply closes (and notifies) nothing new.
 */

// Only dynamic imports below, so mark this file as a module (otherwise its
// top-level names collide with other import-less scripts under tsc).
export {};

// Env must be loaded before @/lib/db is imported (it reads process.env at
// first use, and static imports are hoisted) — same approach, and same reason
// for process.loadEnvFile over @next/env, as scripts/sync-indexer.ts.
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production.local"
    : ".env.development.local";
try {
  process.loadEnvFile(envFile);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const NOTIFICATION_MESSAGE =
  "Trades is retiring, so your trade post was closed. Your Lists still match.";

// In-flight statuses: a post referenced by one of these stays open so the
// trade can finish (matches the stage B drain query).
const IN_FLIGHT_STATUSES = ["pending", "accepted", "partial"] as const;

// notify() fires Discord DMs in the background without returning the
// promise; give them time to go out before this one-shot process exits.
const DM_GRACE_MS = Number(process.env.DM_GRACE_MS ?? 15_000);

async function main() {
  const apply = process.argv.includes("--apply");

  const { and, eq, inArray, notExists, or, sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { activeTrade, tradePost } = await import("@/lib/db/schema");

  const closable = and(
    eq(tradePost.source, "manual"),
    eq(tradePost.status, "open"),
    notExists(
      db
        .select({ one: sql`1` })
        .from(activeTrade)
        .where(
          and(
            inArray(activeTrade.status, [...IN_FLIGHT_STATUSES]),
            or(
              eq(activeTrade.tradePostId, tradePost.id),
              eq(activeTrade.matchedTradePostId, tradePost.id),
            ),
          ),
        ),
    ),
  );

  const candidates = await db
    .select({ id: tradePost.id, userId: tradePost.userId })
    .from(tradePost)
    .where(closable);

  const [{ openManual }] = await db
    .select({ openManual: sql<number>`count(*)::int` })
    .from(tradePost)
    .where(and(eq(tradePost.source, "manual"), eq(tradePost.status, "open")));
  const skipped = openManual - candidates.length;

  const byUser = groupByUser(candidates);
  console.log(
    `${candidates.length} open manual trade post(s) to close across ${byUser.size} user(s); ${skipped} left open (referenced by an in-flight trade).`,
  );
  for (const [userId, ids] of byUser) {
    console.log(`  user ${userId}: ${ids.join(", ")}`);
  }

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to close.");
    return;
  }

  if (candidates.length === 0) return;

  // The WHERE re-checks everything (status guard + no in-flight trade), so a
  // trade offered between the preview and now keeps its post open, and a
  // concurrent/second run can't double-close or double-notify.
  const closed = await db
    .update(tradePost)
    .set({ status: "closed", updatedAt: new Date() })
    .where(closable)
    .returning({ id: tradePost.id, userId: tradePost.userId });

  const closedByUser = groupByUser(closed);
  console.log(
    `\nClosed ${closed.length} post(s) for ${closedByUser.size} user(s).`,
  );
  if (closedByUser.size === 0) return;

  const { notify } = await import("@/lib/notify");
  await notify(
    [...closedByUser.keys()].map((userId) => ({
      userId,
      message: NOTIFICATION_MESSAGE,
    })),
  );
  console.log(
    `Notified ${closedByUser.size} user(s); waiting ${DM_GRACE_MS}ms for Discord DMs...`,
  );
  await new Promise((resolve) => setTimeout(resolve, DM_GRACE_MS));
}

function groupByUser(rows: Array<{ id: string; userId: string }>) {
  const byUser = new Map<string, string[]>();
  for (const row of rows) {
    const ids = byUser.get(row.userId);
    if (ids) ids.push(row.id);
    else byUser.set(row.userId, [row.id]);
  }
  return byUser;
}

// One-shot CLI: exit explicitly so the pg pool / Redis client don't keep the
// process alive (see the note at the bottom of scripts/sync-indexer.ts).
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("close-manual-trade-posts failed:", error);
    process.exit(1);
  });
