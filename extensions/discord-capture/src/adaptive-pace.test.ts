import assert from "node:assert/strict";
import { test } from "node:test";
import {
  carriedPace,
  EASE_AFTER_PAGES,
  MAX_PACE_MS,
  pageLoaded,
  pushedBack,
  readLedger,
  recentRequests,
  startPace,
  trimLedger,
} from "./adaptive-pace";

test("a refusal at Instant jumps to 5s, then doubles up to the cap", () => {
  let pace = startPace(0);
  pace = pushedBack(pace);
  assert.equal(pace.delayMs, 5_000);
  pace = pushedBack(pace);
  assert.equal(pace.delayMs, 10_000);
  for (let i = 0; i < 5; i++) pace = pushedBack(pace);
  assert.equal(pace.delayMs, MAX_PACE_MS);
});

test("eases back a second at a time, never below the user's pace", () => {
  let pace = pushedBack(startPace(3_000)); // 6s
  assert.equal(pace.delayMs, 6_000);
  for (let i = 0; i < EASE_AFTER_PAGES - 1; i++) pace = pageLoaded(pace, 3_000);
  assert.equal(pace.delayMs, 6_000, "not before enough clean pages");
  pace = pageLoaded(pace, 3_000);
  assert.equal(pace.delayMs, 5_000);
  for (let i = 0; i < 10 * EASE_AFTER_PAGES; i++)
    pace = pageLoaded(pace, 3_000);
  assert.equal(pace.delayMs, 3_000);
});

test("a run starts at the slower of the user's pace and what was learned", () => {
  assert.equal(startPace(2_000, 10_000).delayMs, 10_000);
  assert.equal(startPace(12_000, 10_000).delayMs, 12_000);
});

test("a learned pace wears off while nothing searches", () => {
  const at = 1_000_000;
  const stored = { delayMs: 20_000, at };
  assert.equal(carriedPace(stored, at), 20_000);
  assert.equal(carriedPace(stored, at + 5 * 60_000), 10_000);
  assert.equal(carriedPace(stored, at + 60 * 60_000), 0);
  assert.equal(carriedPace(undefined, at), 0);
  assert.equal(carriedPace({ delayMs: "x", at }, at), 0);
});

test("counts requests in the last ten minutes and forgets older ones", () => {
  const now = 10_000_000;
  const ledger = [now - 11 * 60_000, now - 9 * 60_000, now - 1_000, now];
  assert.equal(recentRequests(ledger, now), 3);
  assert.deepEqual(trimLedger(ledger, now), ledger.slice(1));
  assert.deepEqual(readLedger([1, "2", Number.NaN, 3]), [1, 3]);
  assert.deepEqual(readLedger("nope"), []);
});
