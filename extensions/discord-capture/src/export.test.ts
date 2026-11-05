import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeTranscript,
  collect,
  parseMessageTime,
} from "@/lib/discord/transcript";
import { mergeBlocks } from "@/lib/match/transcript-blocks";
import { exportTranscript, runCapture, searchPosts } from "./export";

test("DOM blocks round-trip through the app import and shared parser", () => {
  const blocks = [
    {
      author: "Trader 🌙",
      time: "2026-09-09T03:41:00.000Z",
      body: "HAVE\nYooYeon CC101-108\nWANT\nXinyu CC202",
    },
    {
      author: "링크",
      time: "2026-09-08T23:59:12.345Z",
      body: "https://apollo.cafe/@alice",
    },
  ];
  const text = exportTranscript(blocks);
  assert.deepEqual(mergeBlocks([], text), blocks);
  assert.deepEqual(
    analyzeTranscript(text).messages,
    collect(
      blocks.map((block) => ({ ...block, time: parseMessageTime(block.time) })),
    ),
  );
});
test("refuses header-shaped message content instead of inventing a trader", () => {
  assert.throws(
    () =>
      exportTranscript([
        {
          author: "Trader",
          time: "2026-09-09T03:41:00.000Z",
          body: "HAVE\nYooYeon CC101\nSomeone — 3:41 PM\nHAVE\nXinyu CC202",
        },
      ]),
    /ambiguous/,
  );
});
test("ISO reposts keep the newest instant across midnight", () => {
  const text =
    "Trader — 2026-09-08T23:59:00.000Z\nHAVE\nYooYeon CC101\nTrader — 2026-09-09T00:01:00.000Z\nHAVE\nYooYeon CC101";
  assert.equal(
    analyzeTranscript(text).messages[0].time?.raw,
    "2026-09-09T00:01:00.000Z",
  );
});

test("only a search's own posts are sent, and nothing before any search", () => {
  const scrolled: { key: string; run?: string } = { key: "scrolled" };
  const first = { key: "first", run: "run-1" };
  const second = { key: "second", run: "run-2" };
  const index = [scrolled, first, second];
  assert.deepEqual(searchPosts(index, "run-2"), [second]);
  assert.deepEqual(searchPosts(index, null), []);
  assert.deepEqual(searchPosts(index, "never-ran"), []);
});

test("a run is dated by the last post it captured, not by its delivery", () => {
  const capture = runCapture(
    "run-1",
    [{ capturedAt: 100 }, { capturedAt: 300 }, {}, { capturedAt: 200 }],
    ["CC101", "CC102"],
    9_000,
  );
  assert.deepEqual(capture, {
    run: "run-1",
    capturedAt: 300,
    queries: ["CC101", "CC102"],
  });
});

test("posts from before capture times were kept fall back to now", () => {
  assert.equal(runCapture("run-1", [{}, {}], [], 9_000).capturedAt, 9_000);
});

test("unusable query lists read as none", () => {
  assert.deepEqual(runCapture("run-1", [], undefined, 1).queries, []);
  assert.deepEqual(runCapture("run-1", [], "CC101", 1).queries, []);
  assert.deepEqual(runCapture("run-1", [], ["CC101", 4], 1).queries, ["CC101"]);
});
