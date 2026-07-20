import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cosmoAccount,
  poster,
  tradePost,
  tradePostHave,
  tradePostWant,
} from "@/lib/db/schema";
import { notifyNewMatches } from "@/lib/trade-match-notify";

// Cap on mirrored have rows (poster quantity expands into one tradePostHave
// row per copy, same convention the grid trade dialog already uses) — keeps
// a single poster from generating an unbounded number of rows.
const MAX_MIRRORED_HAVES = 300;
const MAX_QUANTITY_PER_ITEM = 20;

function anyWantKey(w: {
  artist: string | null;
  member: string | null;
  season: string | null;
  class: string | null;
}): string {
  return [w.artist, w.member, w.season, w.class].join("|");
}

/**
 * Keeps a "list" trade post in sync with a poster's resolvable (non-freeform)
 * haves/wants, so posters get matched by the existing trade-matching engine
 * (findTradePostMatches) instead of a parallel implementation. Call after any
 * poster create/update.
 *
 * No-op for posters without an owner or a linked Cosmo account — those lists
 * can still be shared, but they aren't tied to a real trading identity. Once a
 * mirrored trade post moves out of "open" for a reason other than this sync
 * (e.g. a real trade completed via the normal accept/check-transfers flow, a
 * user closed it, or it expired), this intentionally stops touching its status
 * — reopening a mid-trade or completed post would fight with that lifecycle. A
 * post this sync itself closed (poster went empty or lost its owner/link — see
 * closedBySync) is the one case it will reopen once the poster is tradable
 * again.
 */
export async function syncPosterTradePost(posterId: string): Promise<void> {
  const row = await db.query.poster.findFirst({
    where: eq(poster.id, posterId),
    columns: { id: true, userId: true, notes: true, wantsOnly: true },
    with: {
      haves: {
        columns: {
          collectionId: true,
          collectionNo: true,
          member: true,
          season: true,
          class: true,
          thumbnailUrl: true,
          serial: true,
          objektId: true,
          quantity: true,
        },
      },
      wants: {
        columns: {
          collectionId: true,
          collectionNo: true,
          member: true,
          season: true,
          class: true,
          thumbnailUrl: true,
          isAny: true,
          artist: true,
        },
      },
    },
  });

  if (!row) return;

  const existing = await db.query.tradePost.findFirst({
    where: eq(tradePost.linkedPosterId, posterId),
    columns: { id: true, status: true, closedBySync: true },
  });

  if (!row.userId) {
    // Poster has no owner (shouldn't normally happen via the current
    // creation flow) — close any existing mirror since it can't be traded.
    if (existing && existing.status === "open") {
      await db
        .update(tradePost)
        .set({ status: "closed", closedBySync: true, updatedAt: new Date() })
        .where(eq(tradePost.id, existing.id));
    }
    return;
  }
  const userId = row.userId;

  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, userId),
    columns: { id: true },
  });
  if (!linked) {
    if (existing && existing.status === "open") {
      await db
        .update(tradePost)
        .set({ status: "closed", closedBySync: true, updatedAt: new Date() })
        .where(eq(tradePost.id, existing.id));
    }
    return;
  }

  const resolvedHaves = row.haves.filter(
    (h): h is typeof h & { collectionId: string } => h.collectionId !== null,
  );
  const resolvedWants = row.wants.filter(
    (w): w is typeof w & { collectionId: string } =>
      w.collectionId !== null && !w.isAny,
  );
  const anyWants = row.wants.filter((w) => w.isAny === true);

  const haveRows = resolvedHaves
    .flatMap((h) =>
      Array.from(
        { length: Math.max(1, Math.min(h.quantity, MAX_QUANTITY_PER_ITEM)) },
        () => ({
          collectionId: h.collectionId,
          collectionNo: h.collectionNo,
          member: h.member,
          season: h.season,
          class: h.class,
          thumbnailUrl: h.thumbnailUrl,
          serial: h.serial,
          objektId: h.objektId,
        }),
      ),
    )
    .slice(0, MAX_MIRRORED_HAVES);

  const seenWantCollections = new Set<string>();
  const resolvableWantRows = resolvedWants
    .filter((w) => {
      if (seenWantCollections.has(w.collectionId)) return false;
      seenWantCollections.add(w.collectionId);
      return true;
    })
    .map((w) => ({
      collectionId: w.collectionId,
      collectionNo: w.collectionNo,
      member: w.member,
      season: w.season,
      class: w.class,
      thumbnailUrl: w.thumbnailUrl,
    }));

  // ANY wants all share collectionId="" — dedup by filter criteria instead,
  // otherwise the collectionId Set above would collapse them into one.
  const seenAnyWantKeys = new Set<string>();
  const anyWantRows = anyWants
    .filter((w) => {
      const key = anyWantKey(w);
      if (seenAnyWantKeys.has(key)) return false;
      seenAnyWantKeys.add(key);
      return true;
    })
    .map((w) => ({
      collectionId: "",
      isAny: true,
      artist: w.artist,
      member: w.member,
      season: w.season,
      class: w.class,
    }));

  const wantRows = [...resolvableWantRows, ...anyWantRows];

  // A poster whose resolvable items are all gone has nothing to match —
  // close the mirror rather than leave an open post with no items.
  if (haveRows.length === 0 && wantRows.length === 0) {
    if (existing && existing.status === "open") {
      await db
        .update(tradePost)
        .set({ status: "closed", closedBySync: true, updatedAt: new Date() })
        .where(eq(tradePost.id, existing.id));
    }
    return;
  }

  // The manual trade flow requires at least one have unless the post is
  // wants-only, so a poster with wants but no resolvable haves must mirror
  // as wants-only — otherwise the trade card shows an empty HAVE column
  // with no explanation.
  const wantsOnly = row.wantsOnly || haveRows.length === 0;

  const mirroredTradePostId = await db.transaction(async (tx) => {
    let tradePostId: string;
    if (existing) {
      tradePostId = existing.id;
      // Only a post this sync closed itself (poster went empty/unowned) may
      // be reopened here — a post closed by the user, cron expiry, or trade
      // completion keeps its status untouched (see docstring above).
      const reopen = existing.status === "closed" && existing.closedBySync;
      await tx
        .update(tradePost)
        .set({
          description: row.notes,
          wantsOnly,
          updatedAt: new Date(),
          availabilityCheckedAt: null,
          closedBySync: false,
          ...(reopen ? { status: "open", createdAt: new Date() } : {}),
        })
        .where(eq(tradePost.id, tradePostId));
      await tx
        .delete(tradePostHave)
        .where(eq(tradePostHave.tradePostId, tradePostId));
      await tx
        .delete(tradePostWant)
        .where(eq(tradePostWant.tradePostId, tradePostId));
    } else {
      const [created] = await tx
        .insert(tradePost)
        .values({
          userId,
          description: row.notes,
          status: "open",
          wantsOnly,
          source: "list",
          linkedPosterId: posterId,
        })
        .returning({ id: tradePost.id });
      tradePostId = created.id;
    }

    if (haveRows.length > 0) {
      await tx
        .insert(tradePostHave)
        .values(haveRows.map((h) => ({ tradePostId, ...h })));
    }
    if (wantRows.length > 0) {
      await tx
        .insert(tradePostWant)
        .values(wantRows.map((w) => ({ tradePostId, ...w })));
    }

    return tradePostId;
  });

  // Fire-and-forget: proactively notify anyone this poster's edit newly matches.
  void notifyNewMatches(mirroredTradePostId).catch((err) => {
    console.error("[poster-trade-sync] match notification failed:", err);
  });
}
