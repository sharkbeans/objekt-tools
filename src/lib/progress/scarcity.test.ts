import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveScarcityTier,
  SCARCITY_TIER_META,
} from "@/lib/progress/scarcity-tier";

describe("deriveScarcityTier", () => {
  it("classifies by supply thresholds (inclusive upper bounds)", () => {
    assert.equal(deriveScarcityTier(1), "grail");
    assert.equal(deriveScarcityTier(50), "grail");
    assert.equal(deriveScarcityTier(51), "rare");
    assert.equal(deriveScarcityTier(200), "rare");
    assert.equal(deriveScarcityTier(201), "uncommon");
    assert.equal(deriveScarcityTier(1000), "uncommon");
    assert.equal(deriveScarcityTier(1001), "common");
    assert.equal(deriveScarcityTier(50000), "common");
  });

  it("treats zero supply as the rarest tier", () => {
    assert.equal(deriveScarcityTier(0), "grail");
  });

  it("has metadata for every tier it can return", () => {
    for (const supply of [1, 100, 500, 5000]) {
      const tier = deriveScarcityTier(supply);
      assert.ok(SCARCITY_TIER_META[tier], `missing meta for ${tier}`);
      assert.match(SCARCITY_TIER_META[tier].color, /^#[0-9a-f]{6}$/i);
    }
  });
});
