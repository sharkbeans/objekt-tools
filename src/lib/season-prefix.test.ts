import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSeasonPrefix, seasonPrefixMap } from "@/lib/season-prefix";

describe("seasonPrefixMap", () => {
  it("includes gen-02 seasons for every prefix, not just the first two", () => {
    assert.equal(seasonPrefixMap.AA, "Atom02");
    assert.equal(seasonPrefixMap.BB, "Binary02");
    assert.equal(seasonPrefixMap.CC, "Cream02");
    assert.equal(seasonPrefixMap.DD, "Divine02");
    assert.equal(seasonPrefixMap.EE, "Ever02");
  });

  it("round-trips with getSeasonPrefix", () => {
    for (const [prefix, season] of Object.entries(seasonPrefixMap)) {
      assert.equal(getSeasonPrefix(season), prefix, season);
    }
  });
});
