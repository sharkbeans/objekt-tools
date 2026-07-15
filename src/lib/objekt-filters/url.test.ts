import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeCacheKey,
  parseFilterParams,
  serializeFilterParams,
} from "./url";

describe("parseFilterParams", () => {
  it("accepts legacy repeated params", () => {
    const params = new URLSearchParams(
      "member=JiWoo&member=Kaede&season=tripleS%3A%3AAtom01",
    );
    const filters = parseFilterParams(params);
    assert.deepEqual(filters.member, ["JiWoo", "Kaede"]);
    assert.deepEqual(filters.season, ["tripleS::Atom01"]);
  });

  it("accepts comma-joined params (nuqs form)", () => {
    const params = new URLSearchParams("member=JiWoo,Kaede");
    const filters = parseFilterParams(params);
    assert.deepEqual(filters.member, ["JiWoo", "Kaede"]);
  });

  it("defaults sort and filterMode when absent", () => {
    const filters = parseFilterParams(new URLSearchParams());
    assert.equal(filters.sort, "newest");
    assert.equal(filters.filterMode, "haves");
  });
});

describe("serializeFilterParams / parseFilterParams round-trip", () => {
  it("round-trips repeated and comma forms to the same filter state", () => {
    const repeated = parseFilterParams(
      new URLSearchParams("member=JiWoo&member=Kaede&artist=tripleS"),
    );
    const comma = parseFilterParams(
      new URLSearchParams("member=JiWoo,Kaede&artist=tripleS"),
    );
    assert.deepEqual(repeated, comma);

    const serialized = serializeFilterParams(repeated, { page: 2 });
    const reparsed = parseFilterParams(serialized);
    assert.deepEqual(reparsed, repeated);
  });
});

describe("normalizeCacheKey", () => {
  it("treats repeated and comma-joined forms as the same cache key", () => {
    const a = normalizeCacheKey(
      new URLSearchParams("member=JiWoo&member=Kaede&page=1"),
      ["page"],
    );
    const b = normalizeCacheKey(
      new URLSearchParams("page=1&member=JiWoo,Kaede"),
      ["page"],
    );
    assert.equal(a, b);
  });

  it("produces different keys for different filters", () => {
    const a = normalizeCacheKey(new URLSearchParams("member=JiWoo"));
    const b = normalizeCacheKey(new URLSearchParams("member=Kaede"));
    assert.notEqual(a, b);
  });
});
