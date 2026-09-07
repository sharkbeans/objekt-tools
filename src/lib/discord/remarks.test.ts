import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTranscript } from "@/lib/discord/transcript";
import { membersByArtist } from "@/lib/filters";
import { extractRemarks, lineRemark } from "./remarks";

const MEMBERS = new Set(
  Object.values(membersByArtist)
    .flat()
    .map((m) => m.toLowerCase()),
);

describe("lineRemark", () => {
  it("keeps a parenthesised condition and drops the objekt codes", () => {
    assert.equal(
      lineRemark("DaHyun b205 (for sco offers) d206 d329", MEMBERS),
      "for sco offers",
    );
  });

  it("keeps a price without eating the collection number", () => {
    // "CC337 $5.5" must not be read as the price "337 $".
    assert.equal(lineRemark("Hyerin CC336 CC337 $5.5", MEMBERS), "$5.5");
    assert.equal(lineRemark("Kotone b202 12$", MEMBERS), "12$");
  });

  it("keeps ratios and priority notes in the order written", () => {
    assert.equal(lineRemark("Mayu cc334 cc335 (2:1)", MEMBERS), "2:1");
    assert.equal(
      lineRemark("dahyun CC101 CC102 (prio for grid set)", MEMBERS),
      "prio for grid set",
    );
  });

  it("returns nothing for a plain item line", () => {
    assert.equal(lineRemark("Mayu CC103 CC104 CC105", MEMBERS), "");
    assert.equal(lineRemark("Lynn E317-E320 set", MEMBERS), "");
  });

  it("ignores quantities, serials and section words", () => {
    assert.equal(lineRemark("Have: Shion bb306 (#10)", MEMBERS), "");
    assert.equal(lineRemark("hayeon bb119 x2 bb301", MEMBERS), "");
  });
});

describe("extractRemarks", () => {
  const members = Object.values(membersByArtist).flat();

  it("attaches a line's condition to every objekt on that line", () => {
    const map = extractRemarks("DaHyun b205 (for sco offers) d206", members);
    assert.deepEqual(map.get("dahyun|binary01|205"), ["for sco offers"]);
    assert.deepEqual(map.get("dahyun|divine01|206"), ["for sco offers"]);
  });

  it("inherits the member across continuation lines", () => {
    const map = extractRemarks(
      "Lynn cc327 cc328\nLynn cc329 (unscanned)",
      members,
    );
    assert.deepEqual(map.get("lynn|cream02|329"), ["unscanned"]);
    assert.equal(map.has("lynn|cream02|327"), false);
  });

  it("leaves clean lines out of the map entirely", () => {
    assert.equal(extractRemarks("Mayu CC103 CC104", members).size, 0);
  });
});

describe("remarks on a parsed transcript", () => {
  it("rides along on the message so the UI can show them on demand", () => {
    const [message] = parseTranscript(`trader — 3:41 PM
wtt (no sell)
have
xinyu cc336 (unscanned)

want
triples objekts (may decline)`);
    assert.deepEqual(message.remarks["xinyu|cream02|336"], ["unscanned"]);
    // Post-level prose stays in notes rather than being lost.
    assert.match(message.notes ?? "", /may decline/);
  });
});
