import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePastedTrade } from "./paste-parser";

describe("parsePastedTrade", () => {
  it("parses Discord-formatted trade poster text", () => {
    const parsed = parsePastedTrade(`**WTT**

**HAVE**
Moon CC066
Sun CC081
Neptune CC886
Zenith CC082

**WANT**
Any E/AA/BB Spin Fuel

DM for info ^^`);

    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.haves.length, 4);
    assert.equal(parsed.wants.length, 1);
    assert.deepEqual(
      parsed.haves.map((item) => [
        item.season,
        item.collectionNo,
        item.onOffline,
      ]),
      [
        ["Cream02", "066", "offline"],
        ["Cream02", "081", "offline"],
        ["Cream02", "886", "offline"],
        ["Cream02", "082", "offline"],
      ],
    );
    assert.equal(parsed.wants[0].raw, "Any E/AA/BB Spin Fuel");
    assert.equal(parsed.wants[0].freeform, true);
    assert.equal(parsed.notes, "DM for info ^^");
  });

  it("recognizes HAVE and WANT headers wrapped in Discord markdown", () => {
    const headers = [
      ["*HAVE*", "_WANT_"],
      ["***HAVE***", "__*WANT*__"],
      ["__**HAVE**__", "__***WANT***__"],
      ["~~HAVE~~", "# WANT"],
    ];

    for (const [haveHeader, wantHeader] of headers) {
      const parsed = parsePastedTrade(`${haveHeader}
AA201

${wantHeader}
Any BB Spin Fuel`);

      assert.equal(parsed.haves.length, 1);
      assert.equal(parsed.wants.length, 1);
      assert.deepEqual(parsed.errors, []);
    }
  });

  it("parses generated season prefixes", () => {
    const parsed = parsePastedTrade(`HAVE
DD101Z
D2102Z
EE303A

WANT
Any DD`);

    assert.deepEqual(
      parsed.haves.map((item) => [
        item.season,
        item.collectionNo,
        item.onOffline,
      ]),
      [
        ["Divine02", "101", "offline"],
        ["Divine02", "102", "offline"],
        ["Ever02", "303", "online"],
      ],
    );
    assert.deepEqual(parsed.errors, []);
  });

  // ── Real Discord trade-channel shapes (see docs/plans/035) ──────────────

  it("keeps parsing when prose precedes the first item in a section", () => {
    // Regression: a zero-item line used to flip the parser into footer mode,
    // which swallowed every line after it. Real posts open with a sale blurb
    // or a subsection label before the list starts.
    for (const prose of ["WTS ALL", "Mostly Lynn", "Rare objekt list"]) {
      const parsed = parsePastedTrade(
        `HAVE\n${prose}\nJiwoo D325\nYubin AA302`,
      );
      assert.deepEqual(
        parsed.haves.map((i) => [i.member, i.season, i.collectionNo]),
        [
          ["JiWoo", "Divine01", "325"],
          ["YuBin", "Atom02", "302"],
        ],
        `prose line "${prose}" dropped the section`,
      );
      assert.deepEqual(parsed.errors, []);
    }
  });

  it("detaches a quantity fused onto a collection code", () => {
    const parsed = parsePastedTrade("WANT\nShion cc109x4 cc111 cc112x2 cc116");
    assert.deepEqual(
      parsed.wants.map((i) => [i.collectionNo, i.quantity ?? 1]),
      [
        ["109", 4],
        ["111", 1],
        ["112", 2],
        ["116", 1],
      ],
    );
  });

  it("reads the multiplication sign as a quantity", () => {
    const parsed = parsePastedTrade("HAVE\nSohyun D102 (\u00d72)");
    assert.equal(parsed.haves.length, 1);
    assert.equal(parsed.haves[0].quantity, 2);
  });

  it("expands a range written with spaces around the separator", () => {
    const parsed = parsePastedTrade("HAVE\nLynn E317 - 320");
    assert.deepEqual(
      parsed.haves.map((i) => i.collectionNo),
      ["317", "318", "319", "320"],
    );
  });

  it("parses a full WTS post with link, serials and A/Z twins", () => {
    const parsed = parsePastedTrade(`WTS ALL
Mostly Lynn

Jiwoo D325
Lynn C319 C323 D301 #83 D309Z D311
Nakyoung A201A A202A

https://apollo.cafe/@someone?transferable=true

*Price is Negotiable`);

    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.haves.length, 8);
    const d301 = parsed.haves.find((i) => i.collectionNo === "301");
    assert.equal(d301?.serial, "83");
    const d309 = parsed.haves.find((i) => i.collectionNo === "309");
    assert.equal(d309?.onOffline, "offline");
  });

  it("keeps parsing items after prose within a section", () => {
    const parsed = parsePastedTrade(`HAVE
SeoYeon CC101
unscanned, ask for details
HyeRin CC102`);

    assert.deepEqual(
      parsed.haves.map((item) => item.member),
      ["SeoYeon", "HyeRin"],
    );
    assert.equal(parsed.notes, "unscanned, ask for details");
  });

  it("resolves a member named mid-line", () => {
    const parsed = parsePastedTrade(`HAVE
S12 YeonJi CC330
YuBin C305 C322 Kaede BB326`);

    assert.deepEqual(
      parsed.haves.map((item) => [item.member, item.collectionNo]),
      [
        ["YeonJi", "330"],
        ["YuBin", "305"],
        ["YuBin", "322"],
        ["Kaede", "326"],
      ],
    );
  });

  it("assigns a code and its modifiers to every member named ahead of it", () => {
    const parsed = parsePastedTrade("HAVE\nNakyoung Nien CC344 x2 #3");

    assert.deepEqual(
      parsed.haves.map((item) => [
        item.member,
        item.collectionNo,
        item.quantity,
        item.serial,
      ]),
      [
        ["NaKyoung", "344", 2, "3"],
        ["Nien", "344", 2, "3"],
      ],
    );
  });

  it("does not assign collab codes to a member inherited from the prior line", () => {
    const parsed = parsePastedTrade("HAVE\nXinyu\nS1 x S9 CC601");

    assert.deepEqual(
      parsed.haves.map((item) => [item.member, item.collectionNo]),
      [[null, "601"]],
    );
  });

  it("does not read one-letter member aliases mid-line", () => {
    const parsed = parsePastedTrade("HAVE\nSeoYeon CC101 x CC102");

    assert.deepEqual(
      parsed.haves.map((item) => [item.member, item.collectionNo]),
      [
        ["SeoYeon", "101"],
        ["SeoYeon", "102"],
      ],
    );
  });

  it("reads an unlabelled WTT list as haves", () => {
    const parsed = parsePastedTrade("WTT\nSeoYeon CC101 CC102");

    assert.deepEqual(
      parsed.haves.map((item) => item.collectionNo),
      ["101", "102"],
    );
    assert.deepEqual(parsed.errors, []);
  });

  it("does not let a prose preamble open an implicit have section", () => {
    const parsed = parsePastedTrade("WTT\nRare objekt list\nDM for details");

    assert.equal(parsed.haves.length, 0);
    assert.equal(parsed.wants.length, 0);
    assert.equal(parsed.notes, "Rare objekt list\nDM for details");
  });

  it("recognises an or-prefixed want header", () => {
    const parsed = parsePastedTrade(`HAVE
SeoYeon CC101
or want to trade for:
JiWoo CC102`);

    assert.deepEqual(
      parsed.haves.map((item) => item.collectionNo),
      ["101"],
    );
    assert.deepEqual(
      parsed.wants.map((item) => [item.member, item.collectionNo]),
      [["JiWoo", "102"]],
    );
  });

  it("treats a priced markdown sale subheading after WANT as new haves", () => {
    const parsed = parsePastedTrade(`**HAVE**
CC FCO
**WANT**
Chaewon CC301 Unscanned (1:1)
Mayu × Chaewon CC601 Unscanned (1:1)

**CC FCO 1st & 2nd Set ($13/set)**
SeoYeon CC101-CC108 CC109-CC116
**WISE ONLY**`);

    assert.deepEqual(
      parsed.wants.map((item) => `${item.member}:${item.collectionNo}`),
      ["ChaeWon:301", "Mayu:601", "ChaeWon:601"],
    );
    assert.deepEqual(
      parsed.haves.map((item) => `${item.member}:${item.collectionNo}`),
      [
        "SeoYeon:101",
        "SeoYeon:102",
        "SeoYeon:103",
        "SeoYeon:104",
        "SeoYeon:105",
        "SeoYeon:106",
        "SeoYeon:107",
        "SeoYeon:108",
        "SeoYeon:109",
        "SeoYeon:110",
        "SeoYeon:111",
        "SeoYeon:112",
        "SeoYeon:113",
        "SeoYeon:114",
        "SeoYeon:115",
        "SeoYeon:116",
      ],
    );
  });
});
