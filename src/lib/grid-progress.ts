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
