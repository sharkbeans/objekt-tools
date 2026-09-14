import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTranscript, UNKNOWN_AUTHOR } from "@/lib/discord/transcript";
import {
  blocksToTranscript,
  MAX_BLOCKS,
  mergeBlocks,
  trimBlocks,
} from "./transcript-blocks";

// Same shapes as the transcript suite: bracket tags, emoji, a trailing comma
// after the display name, and link-embed chrome that must not survive.
const SAMPLE = `traderA — 3:41 PM
WTS ALL
except SCO

Dm plz
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
Yubin AA302`;

// Discrub's export header, which carries a date and an unpadded hour.
const DISCRUB = `@Kira0211 (09/08/2026 10:55 AM)
WTT/WTS:
HAVE:
CC311

WANT:
Seoyeon CC302
@han haan hanni (09/08/2026 9:07 AM)
WTS
Lynn AA301Z`;

const keysOf = (transcript: string) =>
  new Set(analyzeTranscript(transcript).messages.map((m) => m.key));

describe("mergeBlocks", () => {
  it("keeps one block per message", () => {
    assert.equal(mergeBlocks([], SAMPLE).length, 3);
  });

  it("collapses a paste repeated verbatim", () => {
    const once = mergeBlocks([], SAMPLE);
    const twice = mergeBlocks(once, SAMPLE);
    assert.deepEqual(twice, once);
  });

  it("collapses overlapping pastes the scroll-and-paste workflow produces", () => {
    const parts = SAMPLE.split(/(?=^\S.* — \d)/m);
    assert.equal(parts.length, 3, "fixture should split into three messages");
    const [a, b, c] = parts;
    // Paste 1+2, then 2+3: the shared middle message must not be stored twice.
    const overlapping = mergeBlocks(mergeBlocks([], a + b), b + c);
    assert.deepEqual(overlapping, mergeBlocks([], SAMPLE));
  });

  it("keeps the newer timestamp when a trader bumps the same list", () => {
    const first = mergeBlocks([], "traderA — 3:41 PM\nWTS CC101");
    const bumped = mergeBlocks(first, "traderA — 4:02 PM\nWTS CC101");
    assert.equal(bumped.length, 1);
    assert.equal(bumped[0].time, "4:02 PM");
  });

  it("keeps an edited list as its own post", () => {
    // A different body is different content, so it gets its own key rather
    // than silently replacing what the trader posted before.
    const first = mergeBlocks([], "traderA — 3:41 PM\nWTS CC101");
    const edited = mergeBlocks(first, "traderA — 3:41 PM\nWTS CC102");
    assert.equal(edited.length, 2);
  });

  it("reads a headerless paste as one anonymous post", () => {
    const blocks = mergeBlocks([], "Have\nSeoyeon CC112\n\nWant\nXinyu CC101");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].author, UNKNOWN_AUTHOR);
    assert.equal(blocks[0].time, null);
  });

  it("ignores an empty paste", () => {
    assert.deepEqual(mergeBlocks([], "   \n\n"), []);
  });

  it("moves a re-sighted post to the end so trimming spares active traders", () => {
    const first = mergeBlocks([], "traderA — 3:41 PM\nWTS CC101");
    const second = mergeBlocks(first, "traderB — 3:42 PM\nWTS CC102");
    // traderA bumps: they should now be the most recently seen, not the oldest.
    const bumped = mergeBlocks(second, "traderA — 4:02 PM\nWTS CC101");
    assert.deepEqual(
      bumped.map((block) => block.author),
      ["traderB", "traderA"],
    );
  });
});

describe("trimBlocks", () => {
  const block = (n: number) => ({
    author: `trader${n}`,
    time: "3:41 PM",
    body: `WTS CC${n}`,
  });

  it("leaves a store under the cap alone", () => {
    const blocks = [block(1), block(2)];
    assert.equal(trimBlocks(blocks), blocks);
  });

  it("keeps the most recently seen when over the cap", () => {
    const blocks = Array.from({ length: MAX_BLOCKS + 3 }, (_, i) => block(i));
    const trimmed = trimBlocks(blocks);
    assert.equal(trimmed.length, MAX_BLOCKS);
    // The three oldest went, the newest survived.
    assert.equal(trimmed[0].author, "trader3");
    assert.equal(trimmed.at(-1)?.author, `trader${MAX_BLOCKS + 2}`);
  });

  it("bounds what a paste can grow the store to", () => {
    const huge = Array.from({ length: MAX_BLOCKS }, (_, i) => block(i));
    const merged = mergeBlocks(huge, "traderX — 3:41 PM\nWTS CC999");
    assert.equal(merged.length, MAX_BLOCKS);
    assert.equal(merged.at(-1)?.author, "traderX");
  });
});

describe("blocksToTranscript", () => {
  it("round-trips to the same messages", () => {
    assert.deepEqual(
      keysOf(blocksToTranscript(mergeBlocks([], SAMPLE))),
      keysOf(SAMPLE),
    );
  });

  it("round-trips a Discrub export, unpadded hour and all", () => {
    const blocks = mergeBlocks([], DISCRUB);
    assert.deepEqual(
      blocks.map((block) => block.author),
      ["Kira0211", "han haan hanni"],
    );
    assert.deepEqual(keysOf(blocksToTranscript(blocks)), keysOf(DISCRUB));
  });

  it("round-trips a headerless paste", () => {
    const blocks = mergeBlocks([], "Have\nSeoyeon CC112\n\nWant\nXinyu CC101");
    const [message] = analyzeTranscript(blocksToTranscript(blocks)).messages;
    assert.equal(message.author, UNKNOWN_AUTHOR);
    assert.ok(message.haves.length > 0);
  });

  it("round-trips a display name containing the separator", () => {
    const blocks = mergeBlocks([], "a — b — 3:41 PM\nWTS CC101");
    assert.deepEqual(mergeBlocks([], blocksToTranscript(blocks)), blocks);
  });

  it("does not resurrect stripped embed chrome", () => {
    const withChrome = `traderA — 3:41 PM
WTS ALL

https://objekt.top/@examplenick?transferable=true
examplenick · Collection · Objekt Tracker
Cosmo objekt explorer`;
    const text = blocksToTranscript(mergeBlocks([], withChrome));
    assert.ok(!text.includes("Cosmo objekt explorer"));
    assert.ok(text.includes("WTS ALL"));
  });
});
