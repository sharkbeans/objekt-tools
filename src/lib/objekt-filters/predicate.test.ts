import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  objektMatchesStructuralFilters,
  tradeMatchesFilters,
} from "./predicate";
import type { ObjektStructuralFilters } from "./types";

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

describe("tradeMatchesFilters (grouped season/class regression)", () => {
  const trade = {
    haves: [seoYeon],
    wants: [],
  };

  it("matches a grouped season value scoped to the item's resolved artist", () => {
    assert.equal(
      tradeMatchesFilters(
        trade,
        { ...emptyFilters, season: ["tripleS::Cream02"] },
        "haves",
      ),
      true,
    );
  });

  it("rejects the same season value scoped to a different artist", () => {
    assert.equal(
      tradeMatchesFilters(
        trade,
        { ...emptyFilters, season: ["artms::Cream02"] },
        "haves",
      ),
      false,
    );
  });

  it("matches a grouped class value scoped to the item's resolved artist", () => {
    assert.equal(
      tradeMatchesFilters(
        trade,
        { ...emptyFilters, class: ["tripleS::Double"] },
        "haves",
      ),
      true,
    );
  });

  it("still supports the quick-search grammar alongside structural filters", () => {
    assert.equal(
      tradeMatchesFilters(
        trade,
        { ...emptyFilters, search: "sy 066z" },
        "haves",
      ),
      true,
    );
    assert.equal(
      tradeMatchesFilters(trade, { ...emptyFilters, search: "!sy" }, "haves"),
      false,
    );
  });
});
