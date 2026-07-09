import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ObjektStructuralFilters,
  objektMatchesStructuralFilters,
} from "@/lib/filter-utils";

const emptyFilters: ObjektStructuralFilters = {
  artist: [],
  member: [],
  season: [],
  class: [],
  on_offline: [],
};

const seoYeon = {
  collectionId: "tripleS-Cream02-066Z",
  artist: "tripleS",
  member: "SeoYeon",
  season: "Cream02",
  class: "Double",
  collectionNo: "066Z",
  serial: 12,
};

const heeJin = {
  collectionId: "artms-Version_Up-001A",
  artist: null,
  member: "HeeJin",
  season: "Version_Up",
  class: "Special",
  collectionNo: "001A",
  serial: 1,
};

describe("objektMatchesStructuralFilters", () => {
  it("passes everything when no filters are set", () => {
    assert.equal(objektMatchesStructuralFilters(seoYeon, emptyFilters), true);
  });

  it("matches plain (ungrouped) season/class values", () => {
    assert.equal(
      objektMatchesStructuralFilters(seoYeon, {
        ...emptyFilters,
        season: ["Cream02"],
      }),
      true,
    );
    assert.equal(
      objektMatchesStructuralFilters(seoYeon, {
        ...emptyFilters,
        class: ["Single"],
      }),
      false,
    );
  });

  it("matches grouped 'artistId::value' season/class values scoped to the resolved artist", () => {
    assert.equal(
      objektMatchesStructuralFilters(seoYeon, {
        ...emptyFilters,
        season: ["tripleS::Cream02"],
      }),
      true,
    );
    // Same season value under the wrong artist scope must not match.
    assert.equal(
      objektMatchesStructuralFilters(seoYeon, {
        ...emptyFilters,
        season: ["artms::Cream02"],
      }),
      false,
    );
  });

  it("resolves artist from member when item.artist is absent", () => {
    assert.equal(
      objektMatchesStructuralFilters(heeJin, {
        ...emptyFilters,
        artist: ["artms"],
      }),
      true,
    );
    assert.equal(
      objektMatchesStructuralFilters(heeJin, {
        ...emptyFilters,
        season: ["artms::Version_Up"],
      }),
      true,
    );
  });

  it("filters by on_offline via the z-suffix heuristic", () => {
    assert.equal(
      objektMatchesStructuralFilters(seoYeon, {
        ...emptyFilters,
        on_offline: ["offline"],
      }),
      true,
    );
    assert.equal(
      objektMatchesStructuralFilters(heeJin, {
        ...emptyFilters,
        on_offline: ["offline"],
      }),
      false,
    );
  });

  it("requires member to be in the member filter list", () => {
    assert.equal(
      objektMatchesStructuralFilters(seoYeon, {
        ...emptyFilters,
        member: ["HaYeon"],
      }),
      false,
    );
  });
});
