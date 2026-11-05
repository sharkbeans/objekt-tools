import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeTranscript,
  messageKey,
  UNKNOWN_AUTHOR,
} from "@/lib/discord/transcript";
import { PASTE_CAPTURE } from "./captures";
import {
  blocksToTranscript,
  countNewPosts,
  dropCapture,
  linksOf,
  MAX_BLOCKS,
  membershipOf,
  mergeBlocks,
  readBlocks,
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

  it("keeps a delivered message link through a later plain paste", () => {
    const [first] = mergeBlocks([], SAMPLE);
    const key = messageKey(first.author, first.body);
    const url = "https://discord.com/channels/700/800/456";
    const linked = mergeBlocks([], SAMPLE, { [key]: url });
    assert.equal(linksOf(linked).get(key), url);
    const pastedAgain = mergeBlocks(linked, SAMPLE);
    assert.equal(linksOf(pastedAgain).get(key), url);
    assert.equal(linksOf(pastedAgain).size, 1);
  });

  it("drops a stored link that is not a Discord message", () => {
    const [first] = mergeBlocks([], SAMPLE);
    assert.equal(linksOf([{ ...first, link: "javascript:alert(1)" }]).size, 0);
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

describe("capture membership", () => {
  const memberOf = (blocks: ReturnType<typeof mergeBlocks>) =>
    [...membershipOf(blocks).values()].map((ids) => [...ids]);

  it("leaves a pasted post unmarked, as older stores already read", () => {
    const blocks = mergeBlocks([], SAMPLE);
    assert.equal(
      blocks.some((block) => "captures" in block),
      false,
    );
    assert.deepEqual(memberOf(blocks)[0], [PASTE_CAPTURE]);
  });

  it("names the search that brought a post", () => {
    const blocks = mergeBlocks([], SAMPLE, {}, "run-1");
    assert.deepEqual(blocks[0].captures, ["run-1"]);
  });

  it("stores a post two searches saw once, naming both", () => {
    const blocks = mergeBlocks(
      mergeBlocks([], SAMPLE, {}, "run-1"),
      SAMPLE,
      {},
      "run-2",
    );
    assert.equal(blocks.length, 3);
    assert.deepEqual(blocks[0].captures, ["run-1", "run-2"]);
  });

  it("keeps a pasted post pasted when a search also finds it", () => {
    const blocks = mergeBlocks(mergeBlocks([], SAMPLE), SAMPLE, {}, "run-1");
    assert.deepEqual(blocks[0].captures, [PASTE_CAPTURE, "run-1"]);
  });

  it("does not repeat a capture delivered twice", () => {
    const blocks = mergeBlocks(
      mergeBlocks([], SAMPLE, {}, "run-1"),
      SAMPLE,
      {},
      "run-1",
    );
    assert.deepEqual(blocks[0].captures, ["run-1"]);
  });

  it("keeps a link and the capture together", () => {
    const [first] = mergeBlocks([], SAMPLE);
    const key = messageKey(first.author, first.body);
    const url = "https://discord.com/channels/700/800/456";
    const [block] = mergeBlocks([], SAMPLE, { [key]: url }, "run-1");
    assert.equal(block.link, url);
    assert.deepEqual(block.captures, ["run-1"]);
  });

  it("drops a capture's own posts and spares shared ones", () => {
    const shared = mergeBlocks([], SAMPLE, {}, "run-1");
    const blocks = mergeBlocks(shared, DISCRUB, {}, "run-2");
    const both = mergeBlocks(blocks, SAMPLE, {}, "run-2");
    const left = dropCapture(both, "run-1");
    // Everything run-1 had, run-2 saw too.
    assert.equal(left.length, both.length);
    assert.ok(left.every((block) => block.captures?.join() === "run-2"));
    assert.deepEqual(dropCapture(left, "run-2"), []);
  });

  it("goes back to unmarked when only the paste row is left", () => {
    const blocks = mergeBlocks(mergeBlocks([], SAMPLE), SAMPLE, {}, "run-1");
    assert.equal(
      dropCapture(blocks, "run-1").some((block) => "captures" in block),
      false,
    );
  });

  it("can drop the paste row itself", () => {
    const blocks = mergeBlocks(mergeBlocks([], SAMPLE), SAMPLE, {}, "run-1");
    const left = dropCapture(blocks, PASTE_CAPTURE);
    assert.ok(left.every((block) => block.captures?.join() === "run-1"));
    assert.deepEqual(dropCapture(mergeBlocks([], SAMPLE), PASTE_CAPTURE), []);
  });

  it("still round-trips through the transcript text", () => {
    const blocks = mergeBlocks([], SAMPLE, {}, "run-1");
    assert.deepEqual(keysOf(blocksToTranscript(blocks)), keysOf(SAMPLE));
  });
});

describe("countNewPosts", () => {
  it("counts only what is not stored yet", () => {
    const stored = mergeBlocks([], SAMPLE, {}, "run-1");
    assert.equal(countNewPosts(stored, readBlocks(SAMPLE)), 0);
    assert.equal(countNewPosts(stored, readBlocks(DISCRUB)), 2);
    assert.equal(countNewPosts([], readBlocks(SAMPLE)), 3);
  });

  it("counts a post repeated within a capture once", () => {
    const twice = `${DISCRUB}\n${DISCRUB}`;
    assert.equal(countNewPosts([], readBlocks(twice)), 2);
  });
});

describe("readBlocks", () => {
  it("reads the same messages a merge stores", () => {
    assert.deepEqual(readBlocks(SAMPLE), mergeBlocks([], SAMPLE));
  });

  it("keeps a headerless paste as one anonymous post", () => {
    assert.deepEqual(readBlocks(" Have\nSeoyeon CC112 "), [
      { author: UNKNOWN_AUTHOR, time: null, body: "Have\nSeoyeon CC112" },
    ]);
  });

  it("reads nothing from blank text", () => {
    assert.deepEqual(readBlocks("  \n "), []);
  });
});
