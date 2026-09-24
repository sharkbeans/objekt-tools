// Saved hunts: a grid's "what am I missing", kept on the account so it can be
// set up on one device (a phone, say) and picked up on another (the desktop,
// where the extension runs). Only the user's own choices are stored; wants
// are recomputed from live ownership on every read — see `computeSavedHunt`.

import { and, count, desc, eq } from "drizzle-orm";
import {
  CosmoUnavailableError,
  resolveNickname,
} from "@/lib/cosmo/resolve-nickname";
import { db } from "@/lib/db";
import { cosmoAccount, hunt } from "@/lib/db/schema";
import type { Edition } from "@/lib/edition";
import { computeSavedHunt } from "@/lib/grid-progress";
import { type HuntInput, MAX_HUNTS_PER_USER } from "@/lib/hunts/hunt-input";
import { huntLabel } from "@/lib/match/hunt-url";
import { getGridMintCounts } from "@/lib/progress/grid-mints";
import {
  getProgressMemberCatalog,
  isProgressMember,
} from "@/lib/progress/member-catalog";
import { getCachedOwnedCollectionCounts } from "@/lib/progress/owned-collection-counts";
import { getCached } from "@/lib/server-cache";

/** One FCO/SCO of a season, with the counts a hunt is computed from. */
export type HuntCollection = {
  collectionId: string;
  collectionNo: string;
  season: string;
  class: string;
  onOffline: string;
  member: string;
  artist: string;
  ownedCount: number;
  transferableCount: number;
  gridMintCount: number;
};

export type SavedHuntView = {
  id: string;
  nickname: string;
  member: string;
  season: string;
  edition: Edition;
  mode: "wtb" | "wtt";
  /** "SeoYeon CC103"-style labels, recomputed from current ownership. */
  wants: string[];
  offers: string[];
  updatedAt: string;
  /** False when the hunt's wallet could not be read just now. */
  available: boolean;
};

const HUNTS_TTL_MS = 60_000;

/**
 * A member's season, with ownership and grid mints for `address` — the same
 * code path /api/progress/[nickname]/[member]/ownership and /grid-mints use,
 * so a hunt counts exactly what the grid page shows.
 */
export async function loadSeasonCollections(
  address: string,
  member: string,
  season: string,
): Promise<HuntCollection[]> {
  const [catalog, ownedRows, mints] = await Promise.all([
    getProgressMemberCatalog(member),
    getCachedOwnedCollectionCounts(address),
    getGridMintCounts(address, member),
  ]);
  const owned = new Map(
    ownedRows
      .filter((row) => row.collectionDbId)
      .map((row) => [row.collectionDbId as string, row]),
  );
  return catalog.collections
    .filter((c) => c.season === season)
    .map((c) => {
      // Summed over the A/Z group, as the ownership route does.
      let ownedCount = 0;
      let transferableCount = 0;
      for (const id of c.variantCollectionDbIds) {
        const row = owned.get(id);
        if (!row) continue;
        ownedCount += row.ownedCount;
        transferableCount += row.transferableCount;
      }
      return {
        collectionId: c.collectionId,
        collectionNo: c.collectionNo,
        season: c.season,
        class: c.class,
        onOffline: c.onOffline,
        member: c.member ?? member,
        artist: c.artist ?? "",
        ownedCount,
        transferableCount,
        gridMintCount: mints[c.collectionId] ?? 0,
      };
    });
}

/** A hunt's current wants and offers, as labels. */
export function huntLabels(
  row: Pick<
    typeof hunt.$inferSelect,
    "edition" | "mode" | "skipped" | "offers"
  >,
  seasonCollections: HuntCollection[],
): { wants: string[]; offers: string[] } {
  const edition = row.edition;
  if (edition !== 1 && edition !== 2 && edition !== 3)
    return { wants: [], offers: [] };
  const lists = computeSavedHunt(seasonCollections, edition, {
    mode: row.mode === "wtt" ? "wtt" : "wtb",
    skipped: row.skipped,
    offers: row.offers,
  });
  return {
    wants: lists.wants.map(huntLabel),
    offers: lists.offers.map(huntLabel),
  };
}

async function linkedAccount(userId: string) {
  return db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, userId),
  });
}

function asEdition(edition: number): Edition {
  return edition === 3 ? 3 : edition === 2 ? 2 : 1;
}

function sameNickname(a: string | null | undefined, b: string) {
  return !!a && a.toLowerCase() === b.toLowerCase();
}

/**
 * Every hunt `userId` has saved, newest first, with wants computed now.
 *
 * The rows are read fresh every time, so a hunt just saved or deleted shows
 * at once; the ownership work is cached per user for a minute, keyed by what
 * was saved, so reopening the menu does not re-read the wallet.
 */
export async function listSavedHunts(userId: string): Promise<SavedHuntView[]> {
  const rows = await db
    .select()
    .from(hunt)
    .where(eq(hunt.userId, userId))
    .orderBy(desc(hunt.updatedAt));
  if (!rows.length) return [];
  const version = rows
    .map((row) => `${row.id}@${row.updatedAt.getTime()}`)
    .join(",");
  return getCached(`hunts:v1:${userId}:${version}`, HUNTS_TTL_MS, async () => {
    const linked = await linkedAccount(userId);
    const addresses = new Map<string, Promise<string | null>>();
    const addressFor = (nickname: string) => {
      const key = nickname.toLowerCase();
      let address = addresses.get(key);
      if (!address) {
        address = sameNickname(linked?.nickname, nickname)
          ? Promise.resolve(linked?.address ?? null)
          : resolveNickname(nickname).then(
              (resolved) => resolved?.address ?? null,
              (error) => {
                if (error instanceof CosmoUnavailableError) return null;
                throw error;
              },
            );
        addresses.set(key, address);
      }
      return address;
    };
    const seasons = new Map<string, Promise<HuntCollection[]>>();
    return Promise.all(
      rows.map(async (row): Promise<SavedHuntView> => {
        const base = {
          id: row.id,
          nickname: row.nickname,
          member: row.member,
          season: row.season,
          edition: asEdition(row.edition),
          mode: row.mode === "wtt" ? ("wtt" as const) : ("wtb" as const),
          updatedAt: row.updatedAt.toISOString(),
        };
        const address = await addressFor(row.nickname);
        if (!address)
          return { ...base, wants: [], offers: [], available: false };
        const key = `${address}|${row.member}|${row.season}`;
        let season = seasons.get(key);
        if (!season) {
          season = loadSeasonCollections(address, row.member, row.season);
          seasons.set(key, season);
        }
        return { ...base, ...huntLabels(row, await season), available: true };
      }),
    );
  });
}

export type SaveHuntResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

/**
 * Create or update the user's hunt for one grid.
 *
 * Hunts are for your own grids: the nickname must be the user's linked Cosmo
 * account — the same rule the grid dialog uses before offering to save.
 */
export async function saveHunt(
  userId: string,
  input: HuntInput,
): Promise<SaveHuntResult> {
  const linked = await linkedAccount(userId);
  if (!linked?.nickname || !sameNickname(linked.nickname, input.nickname))
    return {
      ok: false,
      status: 403,
      error: "Hunts can only be saved for your own linked Cosmo account.",
    };
  if (!isProgressMember(input.member))
    return { ok: false, status: 404, error: "Member not found" };
  const catalog = await getProgressMemberCatalog(input.member);
  if (!catalog.collections.some((c) => c.season === input.season))
    return { ok: false, status: 404, error: "Season not found" };

  const [existing] = await db
    .select({ id: hunt.id })
    .from(hunt)
    .where(
      and(
        eq(hunt.userId, userId),
        eq(hunt.member, input.member),
        eq(hunt.season, input.season),
        eq(hunt.edition, input.edition),
      ),
    );
  if (!existing) {
    const [{ total }] = await db
      .select({ total: count() })
      .from(hunt)
      .where(eq(hunt.userId, userId));
    if (total >= MAX_HUNTS_PER_USER)
      return {
        ok: false,
        status: 409,
        error: `You can keep ${MAX_HUNTS_PER_USER} hunts. Delete one to save another.`,
      };
  }

  const now = new Date();
  const [saved] = await db
    .insert(hunt)
    .values({
      userId,
      nickname: linked.nickname,
      member: input.member,
      season: input.season,
      edition: input.edition,
      mode: input.mode,
      skipped: input.skipped,
      offers: input.offers,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [hunt.userId, hunt.member, hunt.season, hunt.edition],
      set: {
        nickname: linked.nickname,
        mode: input.mode,
        skipped: input.skipped,
        offers: input.offers,
        updatedAt: now,
      },
    })
    .returning({ id: hunt.id });
  if (!saved) return { ok: false, status: 500, error: "Could not save" };
  return { ok: true, id: saved.id };
}

/** Delete one of the user's hunts. False when there was no such hunt. */
export async function deleteHunt(userId: string, id: string): Promise<boolean> {
  const removed = await db
    .delete(hunt)
    .where(and(eq(hunt.id, id), eq(hunt.userId, userId)))
    .returning({ id: hunt.id });
  return removed.length > 0;
}
