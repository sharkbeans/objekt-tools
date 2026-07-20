import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyTradeSearchShortcuts,
  extractCompletedSearchShortcuts,
  parseObjektSearchShortcuts,
  parseTradeSearchShortcuts,
} from "@/lib/trade-search-shortcuts";

describe("trade search shortcuts", () => {
  it("parses the wants shorthand into effective filters", () => {
    const parsed = parseTradeSearchShortcuts("wants sy cc101");

    assert.equal(parsed.filterMode, "wants");
    assert.deepEqual(parsed.member, ["SeoYeon"]);
    assert.deepEqual(parsed.season, ["Cream02"]);
    assert.equal(parsed.effectiveSearch, "101");
    assert.equal(parsed.freeTextSearch, "");
    assert.deepEqual(
      parsed.chips.map((chip) => [chip.kind, chip.label]),
      [
        ["mode", "Wants"],
        ["member", "SeoYeon"],
        ["season", "Cream02"],
        ["collection", "101"],
      ],
    );
  });

  it("parses the h shorthand and preserves extra free text", () => {
    const parsed = parseTradeSearchShortcuts("h sy cc101 sealed");

    assert.equal(parsed.filterMode, "haves");
    assert.deepEqual(parsed.member, ["SeoYeon"]);
    assert.deepEqual(parsed.season, ["Cream02"]);
    assert.equal(parsed.effectiveSearch, "101 sealed");
    assert.equal(parsed.freeTextSearch, "sealed");
  });

  it("parses season-only shorthand without forcing a collection number", () => {
    const parsed = parseTradeSearchShortcuts("sy c2");

    assert.equal(parsed.filterMode, undefined);
    assert.deepEqual(parsed.member, ["SeoYeon"]);
    assert.deepEqual(parsed.season, ["Cream02"]);
    assert.equal(parsed.effectiveSearch, "");
    assert.equal(parsed.freeTextSearch, "");
    assert.deepEqual(
      parsed.chips.map((chip) => [chip.kind, chip.label]),
      [
        ["member", "SeoYeon"],
        ["season", "Cream02"],
      ],
    );
  });

  it("parses bare single-letter season prefixes like a -> Atom01", () => {
    const parsed = parseTradeSearchShortcuts("sy a");

    assert.equal(parsed.filterMode, undefined);
    assert.deepEqual(parsed.member, ["SeoYeon"]);
    assert.deepEqual(parsed.season, ["Atom01"]);
    assert.equal(parsed.effectiveSearch, "");
  });

  it("frees c for the Cream01 season prefix; Choerry now uses choe/ch", () => {
    const bare = parseTradeSearchShortcuts("c");
    assert.deepEqual(bare.member, []);
    assert.deepEqual(bare.season, ["Cream01"]);

    const shortform = parseTradeSearchShortcuts("choe");
    assert.deepEqual(shortform.member, ["Choerry"]);
    assert.deepEqual(shortform.season, []);
  });

  it("resolves not-yet-released generations (dd/d2 -> Divine02) without a hardcoded entry", () => {
    const repeated = parseTradeSearchShortcuts("sy dd");
    assert.deepEqual(repeated.season, ["Divine02"]);

    const shorthand = parseTradeSearchShortcuts("sy d2");
    assert.deepEqual(shorthand.season, ["Divine02"]);

    const compact = parseObjektSearchShortcuts("dd101z");
    assert.deepEqual(compact.season, ["Divine02"]);
    assert.equal(compact.effectiveSearch, "101Z");
  });

  it("parses repeated-letter season prefixes like cc without clashing", () => {
    const parsed = parseTradeSearchShortcuts("sy cc");

    assert.equal(parsed.filterMode, undefined);
    assert.deepEqual(parsed.member, ["SeoYeon"]);
    assert.deepEqual(parsed.season, ["Cream02"]);
    assert.equal(parsed.effectiveSearch, "");
    assert.equal(parsed.freeTextSearch, "");
    assert.deepEqual(
      parsed.chips.map((chip) => [chip.kind, chip.label]),
      [
        ["member", "SeoYeon"],
        ["season", "Cream02"],
      ],
    );
  });

  it("parses objekt shortcuts without treating have or want as a side", () => {
    const parsed = parseObjektSearchShortcuts("w sy cc101");

    assert.equal(parsed.filterMode, undefined);
    assert.deepEqual(parsed.member, ["SeoYeon"]);
    assert.deepEqual(parsed.season, ["Cream02"]);
    assert.equal(parsed.effectiveSearch, "w 101");
    assert.deepEqual(
      parsed.chips.map((chip) => [chip.kind, chip.label]),
      [
        ["member", "SeoYeon"],
        ["season", "Cream02"],
        ["collection", "101"],
      ],
    );
  });

  it("recognizes a collection without a season prefix", () => {
    const parsed = parseObjektSearchShortcuts("sy 108z");

    assert.deepEqual(parsed.member, ["SeoYeon"]);
    assert.deepEqual(parsed.season, []);
    assert.equal(parsed.effectiveSearch, "108Z");
    assert.equal(parsed.freeTextSearch, "");
    assert.deepEqual(
      parsed.chips.map((chip) => [chip.kind, chip.label]),
      [
        ["member", "SeoYeon"],
        ["collection", "108Z"],
      ],
    );
  });

  it("promotes completed member tokens while preserving unfinished text", () => {
    const completed = extractCompletedSearchShortcuts("cy 501", {
      mode: "objekt",
      commitAll: false,
    });

    assert.ok(completed);
    assert.deepEqual(completed.member, ["ChaeYeon"]);
    assert.equal(completed.remainingSearch, "501");
  });

  it("promotes a final compact season token on commit", () => {
    const completed = extractCompletedSearchShortcuts("cc101", {
      mode: "objekt",
      commitAll: true,
    });

    assert.ok(completed);
    assert.deepEqual(completed.season, ["Cream02"]);
    assert.equal(completed.remainingSearch, "101");
  });

  it("leaves collection-only searches in the search input", () => {
    const completed = extractCompletedSearchShortcuts("501", {
      mode: "objekt",
      commitAll: true,
    });

    assert.equal(completed, null);
  });

  it("promotes the trade side into the canonical toggle", () => {
    const completed = extractCompletedSearchShortcuts("w sy ", {
      mode: "trade",
      commitAll: false,
    });

    assert.ok(completed);
    assert.equal(completed.filterMode, "wants");
    assert.deepEqual(completed.member, ["SeoYeon"]);
    assert.equal(completed.remainingSearch, "");
  });

  it("keeps advanced comma searches untouched", () => {
    const parsed = parseTradeSearchShortcuts("sy cc101, hj bb002");

    assert.equal(parsed.filterMode, undefined);
    assert.deepEqual(parsed.member, []);
    assert.deepEqual(parsed.season, []);
    assert.equal(parsed.effectiveSearch, "sy cc101, hj bb002");
    assert.equal(parsed.chips.length, 0);
  });

  it("applies shortcuts on top of existing manual filters", () => {
    const effective = applyTradeSearchShortcuts({
      search: "w sy cc101",
      artist: [],
      member: ["JiWoo"],
      season: [],
      class: [],
      on_offline: [],
      sort: "newest",
      filterMode: "haves" as const,
    });

    assert.equal(effective.filterMode, "wants");
    assert.deepEqual(effective.member, ["JiWoo", "SeoYeon"]);
    assert.deepEqual(effective.season, ["Cream02"]);
    assert.equal(effective.search, "101");
  });
});
