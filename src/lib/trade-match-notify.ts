import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tradeMatchSeen } from "@/lib/db/schema";
import { notify } from "@/lib/notify";
import { publishUserEvent } from "@/lib/realtime";
import { findTradePostMatches } from "@/lib/trade-post-matches";

/**
 * Proactively notifies the owners of newly-matched trade posts, so discovery
 * doesn't depend on someone revisiting their own list/post. Call this after
 * a trade post's haves/wants change (poster sync, manual trade post
 * create/update).
 *
 * Only the OTHER party is notified — the person who just made the change can
 * already see their fresh matches. Dedup is per (notified, matched) pair via
 * trade_match_seen, so a match is only ever announced once per direction;
 * editing your list repeatedly won't re-spam a partner who's already been told.
 */
export async function notifyNewMatches(tradePostId: string): Promise<void> {
  const result = await findTradePostMatches(tradePostId);
  if (!result || result.matches.length === 0) return;

  const matchIds = result.matches.map((m) => m.id);
  const alreadySeen = await db.query.tradeMatchSeen.findMany({
    where: and(
      eq(tradeMatchSeen.matchedTradePostId, tradePostId),
      inArray(tradeMatchSeen.notifiedTradePostId, matchIds),
    ),
    columns: { notifiedTradePostId: true },
  });
  const seenSet = new Set(alreadySeen.map((r) => r.notifiedTradePostId));
  const newMatches = result.matches.filter((m) => !seenSet.has(m.id));
  if (newMatches.length === 0) return;

  await db
    .insert(tradeMatchSeen)
    .values(
      newMatches.map((m) => ({
        notifiedTradePostId: m.id,
        matchedTradePostId: tradePostId,
      })),
    )
    .onConflictDoNothing();

  const sourceName = result.sourceTrade.user.cosmoAccount?.nickname
    ? `@${result.sourceTrade.user.cosmoAccount.nickname}`
    : result.sourceTrade.user.name;
  const message = `${sourceName} has a new trade that matches what you're looking for!`;

  await notify(
    newMatches.map((m) => ({
      userId: m.userId,
      tradePostId: m.id,
      message,
    })),
  );

  await Promise.all(
    newMatches.map((m) =>
      publishUserEvent(m.userId, "notification:new", { message }),
    ),
  );
}
