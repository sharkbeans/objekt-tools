import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type InventoryFilterRow,
  matchesInventoryFilters,
} from "@/lib/inventory-filter-match";

function row(overrides: Partial<InventoryFilterRow> = {}): InventoryFilterRow {
  return {
    collectionId: "Cream02 SeoYeon 503Z",
    artist: "triples",
    member: "SeoYeon",
    collectionNo: "503Z",
    season: "Cream02",
    class: "Motion",
    onOffline: "online",
    serial: 95,
    ...overrides,
  };
}

function matches(query: string, overrides?: Partial<InventoryFilterRow>) {
  return matchesInventoryFilters(row(overrides), { query });
}

describe("matchesInventoryFilters", () => {
  it("matches everything with no filters", () => {
    assert.equal(matchesInventoryFilters(row(), {}), true);
    assert.equal(matches("   "), true);
  });

  it("searches member, collection, season, class and artist case-insensitively", () => {
    assert.equal(matches("seoyeon"), true);
    assert.equal(matches("503"), true);
    assert.equal(matches("cream"), true);
    assert.equal(matches("motion"), true);
    assert.equal(matches("triples"), true);
    assert.equal(matches("hayeon"), false);
  });

  it("resolves member aliases", () => {
    assert.equal(matches("nk", { member: "NaKyoung" }), true);
  });

  it("matches a serial and a serial range", () => {
    assert.equal(matches("#95"), true);
    assert.equal(matches("#90-100"), true);
    assert.equal(matches("#100-90"), true);
    assert.equal(matches("#96"), false);
  });

  it("matches a class shortcut by first letter", () => {
    assert.equal(matches("mco"), true);
    assert.equal(matches("fco"), false);
  });

  it("matches a collection number range with its type", () => {
    assert.equal(matches("500-510"), true);
    assert.equal(matches("500z-510z"), true);
    assert.equal(matches("500a-510a"), false);
    assert.equal(matches("100-200"), false);
  });

  it("matches a collection number range scoped to seasons", () => {
    // "cc" is the second Cream season, keyed "02c".
    assert.equal(matches("cc500-cc510"), true);
    assert.equal(matches("c500-c510"), false);
  });

  it("ANDs terms in a group and ORs groups", () => {
    assert.equal(matches("seoyeon motion"), true);
    assert.equal(matches("seoyeon first"), false);
    assert.equal(matches("seoyeon first, cream"), true);
  });

  it("negates a term with !", () => {
    assert.equal(matches("seoyeon !motion"), false);
    assert.equal(matches("seoyeon !first"), true);
  });

  it("treats LIKE wildcards as ILIKE does", () => {
    assert.equal(matches("s_oyeon"), true);
    assert.equal(matches("cre%02"), true);
  });

  it("filters by artist in either spelling", () => {
    assert.equal(matchesInventoryFilters(row(), { artist: ["tripleS"] }), true);
    assert.equal(matchesInventoryFilters(row(), { artist: ["artms"] }), false);
  });

  it("filters by member exactly", () => {
    assert.equal(matchesInventoryFilters(row(), { member: ["SeoYeon"] }), true);
    assert.equal(matchesInventoryFilters(row(), { member: ["HaYeon"] }), false);
  });

  it("filters by plain and artist-grouped season and class", () => {
    assert.equal(matchesInventoryFilters(row(), { season: ["Cream02"] }), true);
    assert.equal(
      matchesInventoryFilters(row(), { season: ["tripleS::Cream02"] }),
      true,
    );
    assert.equal(
      matchesInventoryFilters(row(), { season: ["artms::Cream02"] }),
      false,
    );
    assert.equal(
      matchesInventoryFilters(row(), { class: ["First", "Motion"] }),
      true,
    );
    assert.equal(matchesInventoryFilters(row(), { class: ["First"] }), false);
  });

  it("filters by online/offline and ignores unknown values", () => {
    assert.equal(
      matchesInventoryFilters(row(), { onOffline: ["online"] }),
      true,
    );
    assert.equal(
      matchesInventoryFilters(row(), { onOffline: ["offline"] }),
      false,
    );
    assert.equal(
      matchesInventoryFilters(row(), { onOffline: ["bogus"] }),
      true,
    );
  });
});
