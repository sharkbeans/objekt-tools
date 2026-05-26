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
});
