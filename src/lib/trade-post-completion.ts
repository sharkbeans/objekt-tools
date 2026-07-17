import { and, eq, inArray, isNull } from "drizzle-orm";
import type { db } from "@/lib/db";
import {
  type activeTrade,
  type activeTradeSide,
  poster,
  posterHave,
  tradePost,
  tradePostHave,
} from "@/lib/db/schema";

type TradePostExecutor = Pick<typeof db, "delete" | "query" | "update">;
type TradeRow = Pick<
  typeof activeTrade.$inferSelect,
  "initiatorUserId" | "matchedTradePostId" | "recipientUserId" | "tradePostId"
>;
type TradeSideRow = Pick<
  typeof activeTradeSide.$inferSelect,
  "collectionId" | "objektId" | "serial" | "userId"
>;

type HaveRow = Pick<
  typeof tradePostHave.$inferSelect,
  "collectionId" | "id" | "objektId" | "serial"
>;
function takeMatchingHaveIds(haves: HaveRow[], sides: TradeSideRow[]) {
  const taken = new Set<number>();

  for (const side of sides) {
    const exact = haves.find(
      (have) => !taken.has(have.id) && have.objektId === side.objektId,
    );
    const fallback = exact
      ? undefined
      : haves.find(
          (have) =>
            !taken.has(have.id) &&
            have.objektId === null &&
            have.collectionId === side.collectionId &&
            have.serial === side.serial,
        );
    const match = exact ?? fallback;
    if (match) taken.add(match.id);
  }

  return taken;
}

async function consumePosterSourceHaves(
  tx: TradePostExecutor,
  posterId: string,
  outgoingSides: TradeSideRow[],
  now: Date,
) {
  const haves = await tx.query.posterHave.findMany({
    where: eq(posterHave.posterId, posterId),
  });

  const usedHaveUnits = new Map<number, number>();
  for (const side of outgoingSides) {
    const match = haves.find((have) => {
      const used = usedHaveUnits.get(have.id) ?? 0;
      if (used >= have.quantity) return false;
      if (have.objektId) return have.objektId === side.objektId;
      return (
        have.collectionId === side.collectionId && have.serial === side.serial
      );
    });
    if (match) {
      usedHaveUnits.set(match.id, (usedHaveUnits.get(match.id) ?? 0) + 1);
    }
  }

  for (const [id, consumed] of usedHaveUnits) {
    const row = haves.find((have) => have.id === id);
    if (!row) continue;
    if (consumed >= row.quantity) {
      await tx.delete(posterHave).where(eq(posterHave.id, id));
    } else {
      await tx
        .update(posterHave)
        .set({ quantity: row.quantity - consumed })
        .where(eq(posterHave.id, id));
    }
  }

  if (usedHaveUnits.size > 0) {
    await tx
      .update(poster)
      .set({ updatedAt: now })
      .where(eq(poster.id, posterId));
  }
}

/**
 * Consumes only the outgoing haves used by a completed trade. Wants are kept
 * until the owner edits them. A partially filled post returns to the browse
 * list; a post with no haves remains as a closed row.
 */
export async function finalizeCompletedTradePosts(
  tx: TradePostExecutor,
  trade: TradeRow & { sides: TradeSideRow[] },
  now = new Date(),
) {
  const postOwners = [
    { postId: trade.tradePostId, userId: trade.initiatorUserId },
    { postId: trade.matchedTradePostId, userId: trade.recipientUserId },
  ];

  for (const { postId, userId } of postOwners) {
    if (!postId) continue;

    const post = await tx.query.tradePost.findFirst({
      where: eq(tradePost.id, postId),
      with: {
        haves: { where: (have, { isNull }) => isNull(have.deletedAt) },
      },
    });
    if (!post) continue;

    const outgoingSides = trade.sides.filter((side) => side.userId === userId);
    const consumedHaveIds = takeMatchingHaveIds(post.haves, outgoingSides);

    if (post.source === "list" && post.linkedPosterId) {
      await consumePosterSourceHaves(
        tx,
        post.linkedPosterId,
        outgoingSides,
        now,
      );
    }

    if (consumedHaveIds.size > 0) {
      await tx
        .update(tradePostHave)
        .set({ deletedAt: now })
        .where(
          and(
            inArray(tradePostHave.id, [...consumedHaveIds]),
            isNull(tradePostHave.deletedAt),
          ),
        );
    }

    const remainingHaves = post.haves.length - consumedHaveIds.size;
    await tx
      .update(tradePost)
      .set({
        status: remainingHaves > 0 ? "open" : "closed",
        updatedAt: now,
        availabilityCheckedAt: null,
      })
      .where(eq(tradePost.id, postId));
  }
}
