import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
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
 * No-op for posters without an owner — anonymous posters aren't tied to a
 * real trading account. Once a mirrored trade post moves out of "open"
 * (e.g. a real trade against it completed via the normal accept/check-
 * transfers flow), this intentionally stops touching its status — reopening
 * a mid-trade or completed post would fight with that lifecycle.
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
    columns: { id: true, status: true },
  });

  if (!row.userId) {
    // Poster has no owner (shouldn't normally happen via the current
    // creation flow) — close any existing mirror since it can't be traded.
    if (existing && existing.status === "open") {
      await db
        .update(tradePost)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(tradePost.id, existing.id));
    }
    return;
  }
  const userId = row.userId;

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

  const mirroredTradePostId = await db.transaction(async (tx) => {
    let tradePostId: string;
    if (existing) {
      tradePostId = existing.id;
      await tx
        .update(tradePost)
        .set({
          description: row.notes,
          wantsOnly: row.wantsOnly,
          updatedAt: new Date(),
          availabilityCheckedAt: null,
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
          wantsOnly: row.wantsOnly,
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
