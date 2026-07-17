import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PosterData } from "@/components/poster/poster-canvas";
import {
  decodeGridTradeStash,
  encodeGridTradeStash,
} from "@/lib/grid-trade-stash";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";

function item(collectionNo: string): ResolvedPosterItem {
  return {
    parsed: {
      member: "SeoYeon",
      season: "Cream02",
      collectionNo,
      raw: `SeoYeon C${collectionNo}`,
    },
    entry: {
      collectionId: `cream02-seoyeon-${collectionNo}`,
      artist: "tripleS",
      member: "SeoYeon",
      collectionNo,
      season: "Cream02",
      class: "First",
      thumbnailImage: `https://imagedelivery.example/${collectionNo}/thumbnail`,
    },
    imageUrl: `https://imagedelivery.example/${collectionNo}/thumbnail`,
  };
}

function draft(overrides?: Partial<PosterData>): PosterData {
  return {
    username: "sjarkbean",
    cosmoId: "sjarkbean",
    haves: [],
    wants: [item("101Z"), item("102Z")],
    date: "Jul 17, 2026",
    haveTitle: "Have",
    wantTitle: "Want",
    ...overrides,
  };
}

describe("grid trade stash", () => {
  it("round-trips a poster draft", () => {
    const data = draft({ haves: [item("103Z"), item("103Z"), item("104Z")] });
    assert.deepEqual(decodeGridTradeStash(encodeGridTradeStash(data)), data);
  });

  it("produces a URL-fragment-safe string", () => {
    const encoded = encodeGridTradeStash(draft());
    assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  });

  it("collapses repeated duplicate copies instead of growing linearly", () => {
    const one = encodeGridTradeStash(draft({ haves: [item("103Z")] }));
    const many = encodeGridTradeStash(
      draft({ haves: Array.from({ length: 200 }, () => item("103Z")) }),
    );
    assert.ok(many.length < one.length + 100);
  });

  it("returns null for garbage input", () => {
    assert.equal(decodeGridTradeStash("not-valid-base64-json"), null);
    assert.equal(decodeGridTradeStash(""), null);
  });
});
