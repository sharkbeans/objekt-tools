import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractProfileLink,
  mergeTranscripts,
  messageKey,
  parseTranscript,
  splitMessages,
} from "./transcript";

// Shapes taken from a real tripleS trade channel — display names with bracket
// tags, emoji, Hangul, and the trailing comma Discord emits after some names.
const SAMPLE = `traderA — 3:41 PM
WTS ALL
except SCO

https://objekt.top/@examplenick?artist=tripleS&transferable=true

Dm plz
examplenick · Collection · Objekt Tracker
Cosmo objekt explorer
traderB [TAG],  — 3:44 PM
Have
Seoyeon CC112
Mayu CC103 CC104

Want
Xinyu CC101 CC102
🧋trader_C *2k* [WAV],  — 3:45 PM
WTS ALL
Mostly Lynn

Jiwoo D325
Yubin AA302

https://apollo.cafe/@19%EC%A0%95%ED%95%98%EC%97%B0?transferable=true
Friendly's Collection · Apollo
Apollo - Objekt & gravity explorer for Cosmo`;

describe("splitMessages", () => {
  it("splits on Discord author lines and keeps exotic display names", () => {
    const blocks = splitMessages(SAMPLE);
    assert.deepEqual(
      blocks.map((b) => b.author),
      ["traderA", "traderB [TAG]", "🧋trader_C *2k* [WAV]"],
    );
  });

  it("strips trailing link-embed chrome from the body", () => {
    const [a, , c] = splitMessages(SAMPLE);
    assert.ok(!a.body.includes("Objekt Tracker"));
    assert.ok(!a.body.includes("Cosmo objekt explorer"));
    assert.ok(!c.body.includes("Apollo - Objekt"));
    // The real content survives.
    assert.ok(a.body.includes("WTS ALL"));
    assert.ok(c.body.includes("Jiwoo D325"));
  });

  it("drops text above the first author line", () => {
    const blocks = splitMessages(`orphaned tail of a previous message
traderA — 3:41 PM
Have
Seoyeon CC112`);
    assert.equal(blocks.length, 1);
    assert.ok(!blocks[0].body.includes("orphaned"));
  });
});

describe("extractProfileLink", () => {
  it("reads a nickname from each supported host", () => {
    assert.deepEqual(extractProfileLink("see https://objekt.top/@acin"), {
      nickname: "acin",
      source: "objekt.top",
    });
    assert.deepEqual(
      extractProfileLink("https://apollo.cafe/@Friendly?transferable=true"),
      { nickname: "Friendly", source: "apollo.cafe" },
    );
  });

  it("decodes percent-encoded non-ASCII nicknames", () => {
    const link = extractProfileLink(
      "https://apollo.cafe/@19%EC%A0%95%ED%95%98%EC%97%B0/list/wts2",
    );
    assert.equal(link?.nickname, "19정하연");
  });

  it("returns null when there is no profile link", () => {
    assert.equal(extractProfileLink("Have\nSeoyeon CC112"), null);
  });
});

describe("parseTranscript", () => {
  it("classifies posters by how verifiable their claim is", () => {
    const messages = parseTranscript(SAMPLE);
    assert.deepEqual(
      messages.map((m) => [m.author, m.tier]),
      [
        // Link but no typed items — still verified, the link resolves to
        // real inventory.
        ["traderA", "verified"],
        ["traderB [TAG]", "claimed"],
        // Link *and* items — the link wins, since it can be checked.
        ["🧋trader_C *2k* [WAV]", "verified"],
      ],
    );
  });

  it("parses each poster's own haves and wants", () => {
    const [, b] = parseTranscript(SAMPLE);
    assert.deepEqual(
      b.haves.map((i) => i.collectionNo),
      ["112", "103", "104"],
    );
    assert.deepEqual(
      b.wants.map((i) => i.collectionNo),
      ["101", "102"],
    );
  });

  it("keeps the section-wipe fix working through the splitter", () => {
    // trader_C opens with "WTS ALL" / "Mostly Lynn" before any item.
    const [, , c] = parseTranscript(SAMPLE);
    assert.equal(c.haves.length, 2);
    assert.equal(c.nickname, "19정하연");
  });

  it("drops duplicate reposts within one paste", () => {
    const doubled = `${SAMPLE}\n${SAMPLE}`;
    assert.equal(parseTranscript(doubled).length, 3);
  });
});

describe("mergeTranscripts", () => {
  it("dedupes overlapping selections across successive pastes", () => {
    const first = parseTranscript(SAMPLE);
    const second = parseTranscript(SAMPLE);
    assert.equal(mergeTranscripts(first, second).length, 3);
  });

  it("lets an edited repost replace the earlier version", () => {
    const before = parseTranscript(`traderB — 3:44 PM
Have
Seoyeon CC112`);
    const after = parseTranscript(`traderB — 3:44 PM
Have
Seoyeon CC112
Mayu CC103`);
    const merged = mergeTranscripts(before, after);
    assert.equal(merged.length, 2, "an edited list is a distinct post");
  });
});

describe("messageKey", () => {
  it("ignores whitespace and case so trivial edits do not resurface a post", () => {
    assert.equal(
      messageKey("traderA", "Have\nSeoyeon CC112"),
      messageKey("TRADERA", "Have   Seoyeon   CC112  "),
    );
  });

  it("changes when the list actually changes", () => {
    assert.notEqual(
      messageKey("traderA", "Have\nSeoyeon CC112"),
      messageKey("traderA", "Have\nSeoyeon CC113"),
    );
  });
});
