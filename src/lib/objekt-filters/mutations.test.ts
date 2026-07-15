import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFilterOptions } from "@/lib/filter-options";
import { encodeGroupedValue } from "./grouped";
import { applyArtistSelection } from "./mutations";
import { defaultFilters } from "./types";

const filterOptions = buildFilterOptions({
  artists: ["tripleS", "artms"],
  membersByArtist: {
    tripleS: ["SeoYeon", "HyeRin"],
    artms: ["HeeJin"],
  },
  seasonsByArtist: {
    tripleS: ["Atom01", "Cream02"],
    artms: ["Cream02"],
  },
  classesByArtist: {
    tripleS: ["Double"],
    artms: ["Special"],
  },
});

describe("applyArtistSelection", () => {
  it("keeps values still valid for the new artist selection", () => {
    const filters = {
      ...defaultFilters,
      artist: ["tripleS"],
      member: ["SeoYeon"],
      season: ["Atom01"],
    };
    const next = applyArtistSelection(filters, ["tripleS"], filterOptions);
    assert.deepEqual(next.member, ["SeoYeon"]);
    assert.deepEqual(next.season, ["Atom01"]);
  });

  it("drops member/season/class values invalid for the new artist selection", () => {
    const filters = {
      ...defaultFilters,
      artist: ["tripleS"],
      member: ["SeoYeon"],
      season: ["Atom01"],
      class: ["Double"],
    };
    const next = applyArtistSelection(filters, ["artms"], filterOptions);
    assert.deepEqual(next.member, []);
    assert.deepEqual(next.season, []);
    assert.deepEqual(next.class, []);
    assert.deepEqual(next.artist, ["artms"]);
  });

  it("keeps grouped season/class values scoped to a still-selected artist", () => {
    const filters = {
      ...defaultFilters,
      artist: ["tripleS", "artms"],
      season: [encodeGroupedValue("tripleS", "Cream02")],
    };
    const next = applyArtistSelection(filters, ["artms"], filterOptions);
    // The decoded item "Cream02" is still valid under artms, so it survives
    // even though the encoded artist scope no longer matches — matches the
    // existing structural-match semantics (decode by item validity only).
    assert.deepEqual(next.season, [encodeGroupedValue("tripleS", "Cream02")]);
  });

  it("restores full option sets when artist selection is cleared", () => {
    const filters = {
      ...defaultFilters,
      artist: ["tripleS"],
      member: ["SeoYeon"],
    };
    const next = applyArtistSelection(filters, [], filterOptions);
    assert.deepEqual(next.artist, []);
    assert.deepEqual(next.member, ["SeoYeon"]);
  });
});
