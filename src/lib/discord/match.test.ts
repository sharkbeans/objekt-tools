import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTranscript } from "@/lib/discord/transcript";
import {
  buildPile,
  indexOwned,
  matchTranscript,
  objektKey,
  parseOffering,
} from "./match";

// yeonji_stan is the exact 1:1 for a viewer holding a spare JiYeon CC102:
// they want it, and they hold the SeoYeon CC101 the viewer is after.
const TRANSCRIPT = `haerin.exe — 3:44 PM
Have
Seoyeon CC112
Want
Xinyu CC101
yeonji_stan — 3:52 PM
HAVE
Seoyeon CC101
ChaeYeon CC104
WANT
Jiyeon CC102
Nien CC301`;

const messages = parseTranscript(TRANSCRIPT);

describe("parseOffering", () => {
  it("reads a bare list of spares with no HAVE header", () => {
    const items = parseOffering("Jiyeon CC102\nSeoyeon CC114 CC115");
    assert.deepEqual(
      items.map((i) => [i.member, i.collectionNo]),
      [
        ["JiYeon", "102"],
        ["SeoYeon", "114"],
        ["SeoYeon", "115"],
      ],
    );
  });

  it("returns nothing for empty input", () => {
    assert.deepEqual(parseOffering("   "), []);
  });
});

describe("matching against typed spares", () => {
  it("finds a taker from typed spares alone, with no chain lookup", () => {
    const owned = indexOwned(parseOffering("Jiyeon CC102"));
    const matched = matchTranscript(messages, owned);
    const hits = matched.filter((m) => m.theyWantYouHave.length > 0);
    assert.deepEqual(
      hits.map((m) => m.message.author),
      ["yeonji_stan"],
    );
  });

  it("marks the swap mutual once the return leg is on the want list", () => {
    const owned = indexOwned(parseOffering("Jiyeon CC102"));
    const wanted = objektKey({
      member: "SeoYeon",
      season: "Cream02",
      collectionNo: "101",
    });
    assert.ok(wanted);
    const [top] = matchTranscript(messages, owned, new Set([wanted]));
    assert.equal(top.message.author, "yeonji_stan");
    assert.equal(top.isMutual, true);
    assert.deepEqual(
      top.theyHaveYouWant.map((i) => i.collectionNo),
      ["101"],
    );
  });

  it("finds a supplier from a want list without a spare", () => {
    const wanted = objektKey({
      member: "SeoYeon",
      season: "Cream02",
      collectionNo: "101",
    });
    assert.ok(wanted);

    const hits = matchTranscript(messages, indexOwned([]), new Set([wanted]));
    assert.deepEqual(
      hits
        .filter((match) => match.theyHaveYouWant.length > 0)
        .map((match) => match.message.author),
      ["yeonji_stan"],
    );
  });
});

describe("buildPile", () => {
  it("credits every poster offering the same objekt", () => {
    const doubled = parseTranscript(`${TRANSCRIPT}
someone_else — 4:02 PM
Have
Seoyeon CC101`);
    const entry = buildPile(doubled).find(
      (e) => e.item.collectionNo === "101" && e.item.member === "SeoYeon",
    );
    assert.deepEqual(
      entry?.offeredBy.map((m) => m.author),
      ["yeonji_stan", "someone_else"],
    );
  });
});

describe("theyWantYouHave keys", () => {
  // Two members can want the same collection number, and a trader can repeat
  // a want across blocks. Both produced duplicate React keys when the key
  // omitted the member and the list was not deduped.
  const messages = parseTranscript(`trader — 3:41 PM
HAVE
Seoyeon cc101
WANT
Xinyu CC202
Hayeon CC202
Xinyu CC202`);

  const owned = indexOwned(parseOffering("Xinyu CC202\nHayeon CC202"));

  it("keys each hit by objekt, so two members do not collide", () => {
    const [match] = matchTranscript(messages, owned);
    const keys = match.theyWantYouHave.map((h) => h.key);
    assert.equal(new Set(keys).size, keys.length, "keys must be unique");
    assert.deepEqual(keys.toSorted(), [
      "hayeon|cream02|202",
      "xinyu|cream02|202",
    ]);
  });

  it("lists a repeated want once", () => {
    const [match] = matchTranscript(messages, owned);
    assert.equal(match.theyWantYouHave.length, 2);
  });
});
