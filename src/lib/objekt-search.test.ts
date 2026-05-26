import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  objektMatchesSearch,
  resolveObjektMemberAlias,
} from "@/lib/objekt-search";

const seoYeon = {
  collectionId: "tripleS-Cream02-066Z",
  artist: "tripleS",
  member: "SeoYeon",
  season: "Cream02",
  class: "Double",
  collectionNo: "066Z",
  serial: 12,
};

describe("objekt search", () => {
  it("resolves parser member shortforms", () => {
    assert.equal(resolveObjektMemberAlias("sy"), "SeoYeon");
  });

  it("matches member shortforms through shared tags", () => {
    assert.equal(objektMatchesSearch(seoYeon, "sy"), true);
    assert.equal(objektMatchesSearch(seoYeon, "seo"), true);
    assert.equal(objektMatchesSearch(seoYeon, "sy cc066"), true);
    assert.equal(objektMatchesSearch(seoYeon, "hj"), false);
  });

  it("keeps serial and negated search behavior", () => {
    assert.equal(objektMatchesSearch(seoYeon, "#12"), true);
    assert.equal(objektMatchesSearch(seoYeon, "#1-10"), false);
    assert.equal(objektMatchesSearch(seoYeon, "sy !#1-10"), true);
  });
});
