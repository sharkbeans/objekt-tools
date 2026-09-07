import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeTranscript,
  extractProfileLink,
  mergeTranscripts,
  messageKey,
  parseTranscript,
  splitMessages,
  UNKNOWN_AUTHOR,
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

describe("header timestamp shapes", () => {
  // Discord renders the timestamp differently depending on message age and on
  // the reader's locale/clock setting, and the clipboard carries whatever was
  // rendered. Missing a shape does not just drop that post — the lines fall
  // through into the poster above, misattributing their objekts.
  const shapes: [string, string][] = [
    ["today, 12-hour", "beanjun — 3:41 PM"],
    ["today, 24-hour", "beanjun — 15:41"],
    ["yesterday", "beanjun — Yesterday at 3:41 PM"],
    ["today at", "beanjun — Today at 15:41"],
    ["dated", "beanjun — 09/05/2026 3:41 PM"],
    ["ISO dated", "beanjun — 2026-09-05 3:41 PM"],
    ["plain hyphen", "beanjun - 3:41 PM"],
    ["en dash", "beanjun – 3:41 PM"],
    ["with seconds", "beanjun — 15:41:07"],
  ];

  for (const [label, header] of shapes) {
    it(`recognises a ${label} header`, () => {
      const [msg] = parseTranscript(`${header}\nHave\nSeoyeon CC112`);
      assert.equal(msg?.author, "beanjun");
      assert.deepEqual(
        msg?.haves.map((i) => i.collectionNo),
        ["112"],
      );
    });
  }

  it("keeps each poster's items with that poster across mixed dates", () => {
    const messages = parseTranscript(`alice — 3:41 PM
Have
Seoyeon CC101
bob — Yesterday at 11:20 PM
Have
Lynn D301 D302
carol — 3:52 PM
Have
Kaede CC107`);
    assert.deepEqual(
      messages.map((m) => [m.author, m.haves.map((i) => i.collectionNo)]),
      [
        ["alice", ["101"]],
        ["bob", ["301", "302"]],
        ["carol", ["107"]],
      ],
    );
  });

  it("does not mistake an item range for a header", () => {
    const [msg] = parseTranscript(`traderA — 3:41 PM
Have
Lynn E317 - 320`);
    assert.equal(msg.author, "traderA");
    assert.equal(msg.haves.length, 4);
  });
});

describe("analyzeTranscript", () => {
  it("reads a headerless paste as one anonymous list", () => {
    // Discord's per-message "Copy Text" omits the name/time line entirely.
    const result = analyzeTranscript("HAVE\nSeoyeon CC112\nWANT\nMayu CC103");
    assert.equal(result.headerless, true);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].author, UNKNOWN_AUTHOR);
    assert.equal(result.messages[0].haves.length, 1);
    assert.equal(result.messages[0].wants.length, 1);
  });

  it("rejects headerless text that is not a trade list at all", () => {
    const result = analyzeTranscript("gm everyone how is the drop going");
    assert.equal(result.messages.length, 0);
    assert.equal(result.headerless, true);
  });

  it("counts lines above the first header instead of silently dropping them", () => {
    const result = analyzeTranscript(`tail of someone else's list
Mayu CC104
traderA — 3:41 PM
Have
Seoyeon CC112`);
    assert.equal(result.orphanLines, 2);
    assert.equal(result.messages.length, 1);
    assert.ok(!result.messages[0].body.includes("Mayu"));
  });

  it("reports no orphans for a clean paste", () => {
    const result = analyzeTranscript(SAMPLE);
    assert.equal(result.orphanLines, 0);
    assert.equal(result.headerless, false);
    assert.equal(result.messages.length, 3);
  });
});

describe("messageKey separator", () => {
  it("keeps the author and body apart in the hash", () => {
    // Without a separator, ("ab", "c") and ("a", "bc") hash the same, so two
    // unrelated posts would dedupe into one.
    assert.notEqual(messageKey("ab", "c"), messageKey("a", "bc"));
  });
});
