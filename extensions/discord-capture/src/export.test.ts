import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeTranscript,
  collect,
  parseMessageTime,
} from "@/lib/discord/transcript";
import { mergeBlocks } from "@/lib/match/transcript-blocks";
import { exportTranscript } from "./export";

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
