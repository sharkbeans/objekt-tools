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
});
