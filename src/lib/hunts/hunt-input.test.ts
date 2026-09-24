import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_HUNT_IDS, readHuntInput } from "@/lib/hunts/hunt-input";

const body = {
  nickname: "sjarkbean",
  member: "SeoYeon",
  season: "Cream02",
  edition: 1,
  mode: "wtt",
  skipped: ["cream02-seoyeon-105"],
  offers: ["cream02-seoyeon-101"],
};

describe("readHuntInput", () => {
  it("accepts a hunt", () => {
    assert.deepEqual(readHuntInput(body), body);
  });

  it("drops offers from a Buy hunt and dedupes ids", () => {
    assert.deepEqual(
      readHuntInput({
        ...body,
        mode: "wtb",
        skipped: ["a", "a", "b"],
      }),
      { ...body, mode: "wtb", skipped: ["a", "b"], offers: [] },
    );
  });

  it("treats missing lists as empty", () => {
    const { skipped: _s, offers: _o, ...bare } = body;
    assert.deepEqual(readHuntInput(bare), {
      ...bare,
      skipped: [],
      offers: [],
    });
  });

  it("refuses what it cannot store", () => {
    for (const bad of [
      null,
      "hunt",
      { ...body, nickname: "" },
      { ...body, nickname: "has space" },
      { ...body, member: "" },
      { ...body, season: "Cream 02" },
      { ...body, season: 2 },
      { ...body, edition: 4 },
      { ...body, edition: "1" },
      { ...body, mode: "wts" },
      { ...body, skipped: "cream02-seoyeon-105" },
      { ...body, skipped: [42] },
      { ...body, offers: ["has space"] },
      {
        ...body,
        offers: Array.from({ length: MAX_HUNT_IDS + 1 }, (_, i) => `c${i}`),
      },
    ])
      assert.equal(typeof readHuntInput(bad), "string", JSON.stringify(bad));
  });
});
