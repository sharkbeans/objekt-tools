import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { tradePost, tradePostHave, tradePostWant } from "@/lib/db/schema";

// Finds open trade posts that mutually match a source trade post:
//   - Their "have" items overlap with our "want" items
//   - Their "want" items overlap with our "have" items
// Shared by /api/trades/[id]/matches and /api/posters/[id]/matches (via the
// poster's mirrored "list" trade post — see src/lib/poster-trade-sync.ts) and
// notifyNewMatches (see trade-match-notify.ts).
export async function findTradePostMatches(tradePostId: string) {
  const sourceTrade = await db.query.tradePost.findFirst({
    where: eq(tradePost.id, tradePostId),
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      wants: { where: (w, { isNull }) => isNull(w.deletedAt) },
      user: {
        columns: { id: true, name: true },
        with: { cosmoAccount: { columns: { nickname: true } } },
      },
    },
  });

  if (!sourceTrade) return null;

  const myHaveCollections = sourceTrade.haves.map((h) => h.collectionId);
  const myWantCollections = sourceTrade.wants.map((w) => w.collectionId);

  if (myHaveCollections.length === 0 || myWantCollections.length === 0) {
    return { sourceTrade, matches: [] };
  }

  const myWantSet = new Set(myWantCollections);
  const myHaveSet = new Set(myHaveCollections);

  // Find trades where someone has what I want
  const theyHaveWhatIWant = await db
    .selectDistinct({ tradePostId: tradePostHave.tradePostId })
    .from(tradePostHave)
    .where(
      and(
        inArray(tradePostHave.collectionId, myWantCollections),
        isNull(tradePostHave.deletedAt),
      ),
    );

  // Find trades where someone wants what I have
  const theyWantWhatIHave = await db
    .selectDistinct({ tradePostId: tradePostWant.tradePostId })
    .from(tradePostWant)
    .where(
      and(
        inArray(tradePostWant.collectionId, myHaveCollections),
        isNull(tradePostWant.deletedAt),
      ),
    );

  // Intersect: trades that appear in both sets
  const haveSet = new Set(theyHaveWhatIWant.map((r) => r.tradePostId));
  const matchingIds = theyWantWhatIHave
    .map((r) => r.tradePostId)
    .filter((id) => haveSet.has(id) && id !== tradePostId);

  if (matchingIds.length === 0) {
    return { sourceTrade, matches: [] };
  }

  // Fetch full matching trades
  const matches = await db.query.tradePost.findMany({
    where: and(
      inArray(tradePost.id, matchingIds),
      eq(tradePost.status, "open"),
      ne(tradePost.userId, sourceTrade.userId),
    ),
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      wants: { where: (w, { isNull }) => isNull(w.deletedAt) },
      user: {
        columns: {
          id: true,
          name: true,
          image: true,
          discordId: true,
          discordUsername: true,
        },
        with: {
          cosmoAccount: {
            columns: { nickname: true, address: true },
          },
        },
      },
    },
  });

  // theyHaveIWant / iHaveTheyWant: the actual overlapping items (not just
  // collectionIds), so callers can render thumbnails without a second fetch.
  // Sorted so the most-overlapping partner surfaces first.
  const enriched = matches
    .map((m) => {
      const theyHaveIWant = m.haves.filter((h) =>
        myWantSet.has(h.collectionId),
      );
      const iHaveTheyWant = m.wants.filter((w) =>
        myHaveSet.has(w.collectionId),
      );
      return {
        ...m,
        cosmoNickname: m.user.cosmoAccount?.nickname ?? null,
        cosmoAddress: m.user.cosmoAccount?.address ?? null,
        theyHaveIWant,
        iHaveTheyWant,
      };
    })
    .sort(
      (a, b) =>
        b.theyHaveIWant.length +
        b.iHaveTheyWant.length -
        (a.theyHaveIWant.length + a.iHaveTheyWant.length),
    );

  return { sourceTrade, matches: enriched };
}
