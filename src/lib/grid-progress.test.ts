import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeOfferableDupes } from "@/lib/grid-progress";

type Counts = { owned: number; transferable?: number; gridMints?: number };

function collection(
  collectionNo: string,
  cls: string,
  { owned, transferable, gridMints }: Counts,
) {
  return {
    collectionId: `cream02-seoyeon-${collectionNo}`,
    collectionNo,
    season: "Cream02",
    class: cls,
    onOffline: cls === "Special" ? "online" : "offline",
    artist: "tripleS",
    ownedCount: owned,
    transferableCount: transferable ?? owned,
    gridMintCount: gridMints ?? 0,
  };
}

/** 1st-edition FCO slots 101-108, given as owned counts per slot. */
function firstEdition(counts: Record<string, Counts>) {
  return Array.from({ length: 8 }, (_, i) =>
    collection(
      String(101 + i),
      "First",
      counts[String(101 + i)] ?? { owned: 0 },
    ),
  );
}

function offerableBySlot(rows: ReturnType<typeof computeOfferableDupes>) {
  return Object.fromEntries(
    rows.map((row) => [row.collection.collectionNo, row.offerable]),
  );
}

describe("computeOfferableDupes", () => {
  it("reserves nothing when no grid can be crafted", () => {
    // sjarkbean's Cream02 SeoYeon 1st edition: half the slots missing, so
    // holding a copy back buys nothing — every transferable copy is spare.
    const rows = computeOfferableDupes(
      firstEdition({
        "101": { owned: 2 },
        "102": { owned: 1 },
        "106": { owned: 2 },
        "108": { owned: 2 },
      }),
    );

    assert.deepEqual(offerableBySlot(rows), {
      "101": 2,
      "102": 1,
      "106": 2,
      "108": 2,
    });
  });

  it("reserves one copy of each slot when one grid is craftable", () => {
    const rows = computeOfferableDupes(
      firstEdition(
        Object.fromEntries(
          Array.from({ length: 8 }, (_, i) => [
            String(101 + i),
            { owned: i === 0 ? 3 : 1 },
          ]),
        ),
      ),
    );

    assert.deepEqual(offerableBySlot(rows), { "101": 2 });
  });

  it("reserves two copies of each slot when two grids are craftable", () => {
    const rows = computeOfferableDupes(
      firstEdition(
        Object.fromEntries(
          Array.from({ length: 8 }, (_, i) => [
            String(101 + i),
            { owned: i === 0 ? 5 : 2 },
          ]),
        ),
      ),
    );

    assert.deepEqual(offerableBySlot(rows), { "101": 3 });
  });

  it("treats grid-locked copies as already spent", () => {
    // Two full sets owned, one already gridded (those copies stay in the
    // wallet but are neither craftable nor transferable), so one grid is
    // still craftable and nothing is spare.
    const rows = computeOfferableDupes([
      ...firstEdition(
        Object.fromEntries(
          Array.from({ length: 8 }, (_, i) => [
            String(101 + i),
            { owned: 2, transferable: 1 },
          ]),
        ),
      ),
      collection("201", "Special", { owned: 1, gridMints: 1 }),
    ]);

    assert.deepEqual(offerableBySlot(rows), {});
  });

  it("holds back non-transferable copies before tradeable ones", () => {
    // Every slot has 2 usable copies (1 grid craftable) but slot 101 owns a
    // third, non-transferable copy — that one absorbs the reserve, leaving
    // both tradeable copies free.
    const rows = computeOfferableDupes(
      firstEdition({
        "101": { owned: 3, transferable: 2 },
        ...Object.fromEntries(
          Array.from({ length: 7 }, (_, i) => [String(102 + i), { owned: 1 }]),
        ),
      }),
    );

    assert.deepEqual(offerableBySlot(rows), { "101": 2 });
  });

  it("scores each edition against its own grid", () => {
    // 1st edition is complete (1 grid craftable → reserve 1 each); 2nd
    // edition is missing slots (reserve nothing), so its lone copies are all
    // offerable.
    const rows = computeOfferableDupes([
      ...firstEdition(
        Object.fromEntries(
          Array.from({ length: 8 }, (_, i) => [
            String(101 + i),
            { owned: i === 0 ? 3 : 1 },
          ]),
        ),
      ),
      collection("109", "First", { owned: 1 }),
      collection("110", "First", { owned: 3 }),
      ...Array.from({ length: 6 }, (_, i) =>
        collection(String(111 + i), "First", { owned: 0 }),
      ),
    ]);

    assert.deepEqual(offerableBySlot(rows), {
      "101": 2,
      "109": 1,
      "110": 3,
    });
  });

  it("keeps a floor of one copy for the edition being built", () => {
    // Missing slots, so the grid math alone would reserve nothing — but this
    // is the grid the list is being made for, so the lone copies stay put.
    const rows = computeOfferableDupes(
      [
        collection("109", "First", { owned: 1 }),
        collection("110", "First", { owned: 4 }),
        ...Array.from({ length: 6 }, (_, i) =>
          collection(String(111 + i), "First", { owned: 0 }),
        ),
      ],
      2,
    );

    assert.deepEqual(offerableBySlot(rows), { "110": 3 });
  });

  it("matches sjarkbean's Cream02 SeoYeon board", () => {
    // Real indexer counts: two grids already crafted (2 non-transferable
    // copies of every slot), building the 2nd-edition grid.
    const rows = computeOfferableDupes(
      [
        ...firstEdition({
          "101": { owned: 4, transferable: 2 },
          "102": { owned: 3, transferable: 1 },
          "103": { owned: 2, transferable: 0 },
          "104": { owned: 2, transferable: 0 },
          "105": { owned: 2, transferable: 0 },
          "106": { owned: 4, transferable: 2 },
          "107": { owned: 2, transferable: 0 },
          "108": { owned: 4, transferable: 2 },
        }),
        collection("201", "Special", { owned: 2, gridMints: 2 }),
        collection("109", "First", { owned: 1 }),
        collection("113", "First", { owned: 1 }),
        collection("114", "First", { owned: 1 }),
        collection("116", "First", { owned: 1 }),
        ...["110", "111", "112", "115"].map((no) =>
          collection(no, "First", { owned: 0 }),
        ),
      ],
      2,
    );

    assert.deepEqual(offerableBySlot(rows), {
      "101": 2,
      "102": 1,
      "106": 2,
      "108": 2,
    });
    assert.equal(
      rows.reduce((sum, row) => sum + row.offerable, 0),
      7,
    );
  });

  it("shrinks sjarkbean's offer once a third grid becomes craftable", () => {
    // Same board, but he's since picked up 1x each of the four slots that
    // were fully grid-locked. A third grid is now craftable, so one copy of
    // every slot is reserved for it and the offer drops 7 -> 3.
    const rows = computeOfferableDupes(
      [
        ...firstEdition({
          "101": { owned: 4, transferable: 2 },
          "102": { owned: 3, transferable: 1 },
          "103": { owned: 3, transferable: 1 },
          "104": { owned: 3, transferable: 1 },
          "105": { owned: 3, transferable: 1 },
          "106": { owned: 4, transferable: 2 },
          "107": { owned: 3, transferable: 1 },
          "108": { owned: 4, transferable: 2 },
        }),
        collection("201", "Special", { owned: 2, gridMints: 2 }),
        collection("109", "First", { owned: 1 }),
        collection("113", "First", { owned: 1 }),
        collection("114", "First", { owned: 1 }),
        collection("116", "First", { owned: 1 }),
        ...["110", "111", "112", "115"].map((no) =>
          collection(no, "First", { owned: 0 }),
        ),
      ],
      2,
    );

    assert.deepEqual(offerableBySlot(rows), {
      "101": 1,
      "106": 1,
      "108": 1,
    });
  });

  it("keeps one copy of FCOs that belong to no grid", () => {
    const rows = computeOfferableDupes([
      collection("121", "First", { owned: 3 }),
      collection("122", "First", { owned: 1 }),
    ]);

    assert.deepEqual(offerableBySlot(rows), { "121": 2 });
  });
});
