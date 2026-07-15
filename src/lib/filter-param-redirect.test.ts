import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRepeatedFilterParams } from "./filter-param-redirect";

describe("normalizeRepeatedFilterParams", () => {
  it("returns null when no filter param repeats", () => {
    const url = new URL("https://objekt.my/trades?member=JiWoo&sort=newest");
    assert.equal(normalizeRepeatedFilterParams(url), null);
  });

  it("collapses a repeated filter param to comma-joined form", () => {
    const url = new URL(
      "https://objekt.my/trades?member=JiWoo&member=Kaede&sort=newest",
    );
    const result = normalizeRepeatedFilterParams(url);
    assert.ok(result);
    assert.equal(result.searchParams.get("member"), "JiWoo,Kaede");
    assert.equal(result.searchParams.get("sort"), "newest");
  });

  it("collapses multiple repeated filter params independently", () => {
    const url = new URL(
      "https://objekt.my/trades?member=JiWoo&member=Kaede&season=Atom01&season=Cream02",
    );
    const result = normalizeRepeatedFilterParams(url);
    assert.ok(result);
    assert.equal(result.searchParams.get("member"), "JiWoo,Kaede");
    assert.equal(result.searchParams.get("season"), "Atom01,Cream02");
  });

  it("leaves a single-valued filter param untouched", () => {
    const url = new URL("https://objekt.my/trades?member=JiWoo");
    assert.equal(normalizeRepeatedFilterParams(url), null);
  });

  it("preserves the path and non-filter params", () => {
    const url = new URL(
      "https://objekt.my/trades?page=2&member=JiWoo&member=Kaede",
    );
    const result = normalizeRepeatedFilterParams(url);
    assert.ok(result);
    assert.equal(result.pathname, "/trades");
    assert.equal(result.searchParams.get("page"), "2");
  });
});
