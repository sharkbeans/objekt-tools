import { type Edition, getCollectionEdition } from "@/lib/edition";

// Copies consumed by past grids stay in the wallet (grid-locked, not
// burned), so usable copies of an FCO = ownedCount - gridded. The number of
// full sets currently griddable is the scarcest FCO's usable count.
export function computeGriddable(
  firsts: { ownedCount: number }[],
  gridded: number,
): number {
  if (firsts.length === 0) return 0;
  return Math.max(0, Math.min(...firsts.map((c) => c.ownedCount - gridded)));
}

export type HuntRow<T> = {
  collection: T;
  /** Copies not already spent on past grids. */
  usable: number;
  /** Copies still missing for the next grid. */
  needed: number;
};

/**
 * What each FCO slot still needs for the *next* grid past however many are
 * already griddable — so this works whether nothing has been gridded yet or
 * the user is stacking up for another grid on top of ones they can already
 * craft. The grid dialog's rows, and the wants of a saved hunt.
 */
export function computeHuntRows<T extends { ownedCount: number }>(
  firsts: T[],
  gridded: number,
): HuntRow<T>[] {
  const target = computeGriddable(firsts, gridded) + 1;
  return firsts.map((collection) => {
    const usable = collection.ownedCount - gridded;
    return { collection, usable, needed: Math.max(0, target - usable) };
  });
}

// 3x3 grid slots (row/col, 1-indexed), skipping the center cell reserved for
// the reward SCO. Editions 1-2 use all 8 outer cells; edition 3 uses only
// the 4 orthogonal (diamond) cells and leaves the corners empty.
export const FULL_GRID_SLOTS = [
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 1],
  [2, 3],
  [3, 1],
  [3, 2],
  [3, 3],
] as const;

export const DIAMOND_GRID_SLOTS = [
  [1, 2],
  [2, 1],
  [2, 3],
  [3, 2],
] as const;

export function getGridSlots(edition: number) {
  return edition === 3 ? DIAMOND_GRID_SLOTS : FULL_GRID_SLOTS;
}

// FCO collectionNo carries a trailing A/Z variant letter (e.g. "101Z") that's
// meaningless to a user picking a slot — strip it for display.
export function formatSlotSerial(collectionNo: string): string {
  return collectionNo.replace(/[A-Za-z]$/, "");
}

type OfferableInput = {
  collectionId: string;
  collectionNo: string;
  class: string;
  season: string;
  onOffline: string;
  artist?: string | null;
  ownedCount: number;
  transferableCount: number;
  gridMintCount: number;
};

export type OfferableDupe<T> = { collection: T; offerable: number };

// Map key for FCOs that belong to no grid at all (collectionNo outside the
// 101-120 range, or an artist with no edition concept).
const NO_EDITION = 0;

/**
 * How many copies of each FCO in a season are genuinely spare — i.e. safe to
 * offer as trade haves.
 *
 * The reserve is *not* a flat "keep one of each". It's the number of grids
 * you could still craft, held back from every slot card of that edition:
 * craft 0 grids (a slot is missing) and nothing is reserved; craft 2 and two
 * copies of each are. And because a spare 1st-edition FCO is only spare
 * relative to the *1st-edition* grid, each edition is bucketed and scored
 * against its own slots.
 *
 * `activeEdition` is the grid the caller is building a list *for*. Its slots
 * keep a floor of one copy each even when no grid is craftable yet — giving
 * away the pieces of the grid you're actively chasing is never what the user
 * meant. Every other edition is scored on the grid math alone, which is what
 * frees up e.g. spare 1st-edition FCOs to pay for a 2nd-edition grid.
 */
export function computeOfferableDupes<T extends OfferableInput>(
  seasonCollections: T[],
  activeEdition?: Edition,
): OfferableDupe<T>[] {
  const byEdition = new Map<number, T[]>();
  for (const c of seasonCollections) {
    const edition =
      getCollectionEdition({
        artist: c.artist,
        class: c.class,
        onOffline: c.onOffline,
        collectionNo: c.collectionNo,
        season: c.season,
      }) ?? NO_EDITION;
    const group = byEdition.get(edition);
    if (group) group.push(c);
    else byEdition.set(edition, [c]);
  }

  const offerable: OfferableDupe<T>[] = [];

  for (const [edition, group] of byEdition) {
    const firsts = group.filter((c) => c.class === "First");
    if (firsts.length === 0) continue;

    // No grid ever consumes these, so there's no grid-based reserve to
    // derive — fall back to the plain reading of "duplicate": keep one.
    if (edition === NO_EDITION) {
      for (const c of firsts) {
        offerable.push({
          collection: c,
          offerable: Math.max(
            0,
            Math.min(c.transferableCount, c.ownedCount - 1),
          ),
        });
      }
      continue;
    }

    // Same derivation as the grid board: the edition's reward SCOs carry the
    // mint count that stands in for "how many times this grid was redeemed".
    const gridded = group
      .filter((c) => c.class === "Special")
      .reduce((sum, c) => sum + c.gridMintCount, 0);
    const griddable = computeGriddable(firsts, gridded);
    const reserve =
      edition === activeEdition ? Math.max(1, griddable) : griddable;

    for (const c of firsts) {
      const usable = Math.max(0, c.ownedCount - gridded);
      // `min` against transferableCount holds back the *non*-transferable
      // copies first to satisfy the reserve — they can't be traded anyway,
      // so spending them on the reserve frees up more tradeable ones.
      offerable.push({
        collection: c,
        offerable: Math.max(0, Math.min(c.transferableCount, usable - reserve)),
      });
    }
  }

  return offerable.filter((row) => row.offerable > 0);
}

function byCollectionNo(
  a: { collectionNo: string },
  b: { collectionNo: string },
) {
  return a.collectionNo.localeCompare(b.collectionNo, undefined, {
    numeric: true,
  });
}

/**
 * One edition's board out of a season: its FCOs and reward SCOs in slot
 * order, and how many times it has been gridded (the reward mints). The same
 * grouping the grid section does before handing a board to the dialog.
 */
export function editionBoard<T extends OfferableInput>(
  seasonCollections: T[],
  edition: Edition,
): { firsts: T[]; specials: T[]; gridded: number } {
  const firsts: T[] = [];
  const specials: T[] = [];
  for (const c of seasonCollections) {
    const cEdition = getCollectionEdition({
      artist: c.artist,
      class: c.class,
      onOffline: c.onOffline,
      collectionNo: c.collectionNo,
      season: c.season,
    });
    if (cEdition !== edition) continue;
    if (c.class === "First") firsts.push(c);
    else if (c.class === "Special") specials.push(c);
  }
  firsts.sort(byCollectionNo);
  specials.sort(byCollectionNo);
  const gridded = specials.reduce((sum, c) => sum + c.gridMintCount, 0);
  return { firsts, specials, gridded };
}

export interface SavedHuntChoice {
  mode: "wtb" | "wtt";
  /** collectionIds deselected from the missing slots. */
  skipped: readonly string[];
  /** collectionIds of dupes opted into offering. */
  offers: readonly string[];
}

/**
 * A saved hunt's current wants and offers, from live ownership.
 *
 * Wants are recomputed rather than stored: every slot still missing for the
 * next grid, minus the ones the user deselected — so a hunt shrinks as the
 * user collects. Offers are the ticked dupes that are *still* spare (a dupe
 * traded away or spent on a grid drops out), never in Buy mode, and never one
 * the same hunt is asking for, exactly as the grid dialog builds them.
 */
export function computeSavedHunt<T extends OfferableInput>(
  seasonCollections: T[],
  edition: Edition,
  choice: SavedHuntChoice,
): { wants: T[]; offers: T[] } {
  const { firsts, gridded } = editionBoard(seasonCollections, edition);
  const skipped = new Set(choice.skipped);
  const wants = computeHuntRows(firsts, gridded)
    .filter(
      (row) => row.needed > 0 && !skipped.has(row.collection.collectionId),
    )
    .map((row) => row.collection);
  if (choice.mode !== "wtt") return { wants, offers: [] };
  const wanted = new Set(wants.map((c) => c.collectionId));
  const ticked = new Set(choice.offers);
  const offers = computeOfferableDupes(seasonCollections, edition)
    .map((dupe) => dupe.collection)
    .filter((c) => ticked.has(c.collectionId) && !wanted.has(c.collectionId));
  return { wants, offers };
}
