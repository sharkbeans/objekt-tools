import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PosterData } from "@/components/poster/poster-canvas";
import type { ResolvedPosterItem } from "@/lib/poster/poster-resolver";
import { formatPosterAsText } from "@/lib/poster/poster-text-format";

function item(
  member: string,
  collectionNo: string,
  overrides: Partial<ResolvedPosterItem["parsed"]> = {},
): ResolvedPosterItem {
  return {
    parsed: {
      member,
      season: "Cream02",
      collectionNo,
      raw: `${member} CC${collectionNo}`,
      ...overrides,
    },
    entry: {
      collectionId: `cream02-${member}-${collectionNo}`.toLowerCase(),
      artist: "tripleS",
      member,
      collectionNo,
      season: "Cream02",
      class: "First",
      thumbnailImage: "https://imagedelivery.example/thumb",
    },
    imageUrl: "https://imagedelivery.example/thumb",
  };
}

function freeform(raw: string): ResolvedPosterItem {
  return {
    parsed: { member: null, season: "", collectionNo: "", raw, freeform: true },
    entry: null,
    imageUrl: null,
  };
}

function poster(overrides: Partial<PosterData> = {}): PosterData {
  return {
    username: "sjarkbean",
    cosmoId: "sjarkbean",
    haves: [],
    wants: [],
    date: "Aug 6, 2026",
    haveTitle: "Have",
    wantTitle: "Want",
    ...overrides,
  };
}

describe("formatPosterAsText", () => {
  it("strips the A/Z variant suffix from collection numbers", () => {
    const text = formatPosterAsText(
      poster({
        haves: [
          item("SeoYeon", "101Z"),
          item("SeoYeon", "101Z"),
          item("SeoYeon", "102Z"),
          item("SeoYeon", "201Z"),
        ],
        wants: [item("SeoYeon", "110A")],
      }),
    );

    assert.equal(
      text,
      [
        "**HAVE**",
        "SeoYeon CC101(x2) CC102 CC201",
        "",
        "**WANT**",
        "SeoYeon CC110",
      ].join("\n"),
    );
  });

  it("strips the suffix on unresolved parsed items too", () => {
    const unresolved: ResolvedPosterItem = {
      ...item("HyeRin", "105Z"),
      entry: null,
    };
    const text = formatPosterAsText(poster({ haves: [unresolved] }));

    assert.equal(text, ["**HAVE**", "HyeRin CC105"].join("\n"));
  });

  it("appends the list link after the notes", () => {
    const text = formatPosterAsText(
      poster({
        haves: [item("SeoYeon", "101Z"), freeform("AA/BB Spin Fuel")],
        notes: "dm me",
      }),
      "https://list.objekt.my/ft0teg",
    );

    assert.equal(
      text,
      [
        "**HAVE**",
        "SeoYeon CC101",
        "AA/BB Spin Fuel",
        "",
        "dm me",
        "",
        "https://list.objekt.my/ft0teg",
      ].join("\n"),
    );
  });

  it("omits the link line for an unsaved draft", () => {
    const text = formatPosterAsText(
      poster({ haves: [item("SeoYeon", "101Z")] }),
    );

    assert.equal(text, ["**HAVE**", "SeoYeon CC101"].join("\n"));
    assert.equal(
      formatPosterAsText(poster({ haves: [item("SeoYeon", "101Z")] }), null),
      text,
    );
  });
});
