import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTradeText, type TradeTextItem } from "@/lib/trade/trade-text";

function item(
  member: string,
  collectionNo: string,
  overrides: Partial<TradeTextItem> = {},
): TradeTextItem {
  return {
    collectionId: `cream02-${member}-${collectionNo}`.toLowerCase(),
    collectionNo,
    member,
    season: "Cream02",
    artist: "tripleS",
    class: "First",
    ...overrides,
  };
}

describe("formatTradeText", () => {
  it("groups by member and collapses duplicates into counts", () => {
    const text = formatTradeText({
      haves: [
        item("SeoYeon", "101Z"),
        item("SeoYeon", "101Z"),
        item("SeoYeon", "108Z"),
      ],
      wants: [item("SeoYeon", "110Z")],
    });

    assert.equal(
      text,
      ["Have", "SeoYeon CC101 x2 CC108", "", "Want", "SeoYeon CC110"].join(
        "\n",
      ),
    );
  });

  it("respects an explicit quantity", () => {
    const text = formatTradeText({
      haves: [item("SeoYeon", "101Z", { quantity: 3 })],
      wants: [],
    });

    assert.equal(
      text,
      ["Have", "SeoYeon CC101 x3", "", "Want", "None"].join("\n"),
    );
  });

  it("prints freeform entries verbatim and wildcards as Any", () => {
    const text = formatTradeText({
      haves: [item("SeoYeon", "101Z")],
      wants: [
        item("", "", { customLabel: "any low serial", isAny: true }),
        item("Nakyoung", "", { isAny: true, collectionNo: null }),
      ],
    });

    assert.equal(
      text,
      [
        "Have",
        "SeoYeon CC101",
        "",
        "Want",
        "any low serial",
        "Any Nakyoung",
      ].join("\n"),
    );
  });

  it("appends notes and a labelled link only when given", () => {
    const source = {
      haves: [item("SeoYeon", "101Z")],
      wants: [],
      description: "dm me on discord",
    };

    assert.equal(
      formatTradeText(source),
      [
        "Have",
        "SeoYeon CC101",
        "",
        "Want",
        "None",
        "",
        "dm me on discord",
      ].join("\n"),
    );
    assert.equal(
      formatTradeText(source, "https://objekt.my/list/abc", "List"),
      [
        "Have",
        "SeoYeon CC101",
        "",
        "Want",
        "None",
        "",
        "dm me on discord",
        "",
        "List: https://objekt.my/list/abc",
      ].join("\n"),
    );
  });

  it("uses the poster's own section headings when set", () => {
    const text = formatTradeText({
      haves: [item("SeoYeon", "101Z")],
      wants: [item("SeoYeon", "110Z")],
      haveTitle: "Offering",
      wantTitle: "Looking for",
    });

    assert.equal(
      text,
      ["Offering", "SeoYeon CC101", "", "Looking for", "SeoYeon CC110"].join(
        "\n",
      ),
    );
  });
});
