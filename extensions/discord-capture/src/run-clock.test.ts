import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAsOf, formatRemaining, remainingMs } from "./run-clock";

const now = Date.UTC(2026, 8, 15, 12);

test("no estimate without a running run", () => {
  assert.equal(remainingMs(null, now), null);
  assert.equal(remainingMs({ running: false, total: 3 }, now), null);
  assert.equal(remainingMs({ running: true, total: 3, done: 0 }, now), null);
});

test("guesses from pace and pages before anything is measured", () => {
  const ms = remainingMs(
    {
      running: true,
      done: 0,
      total: 4,
      startedAt: now,
      startDone: 0,
      pages: 3,
      delayMs: 5_000,
    },
    now,
  );
  // 4 queries × 3 pages × (5s pause + 4s page)
  assert.equal(ms, 4 * 3 * 9_000);
});

test("measures from the queries this call has behind it", () => {
  const ms = remainingMs(
    {
      running: true,
      // Third query submitted, on its first page: two are behind the run.
      done: 3,
      page: 1,
      total: 10,
      startedAt: now - 120_000,
      startDone: 0,
      pages: 3,
      delayMs: 5_000,
    },
    now,
  );
  assert.equal(ms, 8 * 60_000);
});

test("a resumed run measures only from where it picked up", () => {
  const ms = remainingMs(
    {
      running: true,
      done: 7,
      page: 1,
      total: 10,
      startedAt: now - 60_000,
      startDone: 5,
      pages: 1,
      delayMs: 0,
    },
    now,
  );
  // One query behind this call, in 60s; four left.
  assert.equal(ms, 4 * 60_000);
});

test("a resumed run starts from its offset, not one before it", () => {
  const ms = remainingMs(
    {
      running: true,
      done: 5,
      total: 10,
      startedAt: now,
      startDone: 5,
      pages: 1,
      delayMs: 0,
    },
    now,
  );
  assert.equal(ms, 5 * 4_000);
});

test("remaining time reads in minutes and hours", () => {
  assert.equal(formatRemaining(20_000), "under a minute left");
  assert.equal(formatRemaining(4 * 60_000), "~4 min left");
  assert.equal(formatRemaining(60 * 60_000), "~1 h left");
  assert.equal(formatRemaining(65 * 60_000), "~1 h 5 min left");
});

test("as of names the timezone", () => {
  const text = formatAsOf(now, "en-GB");
  assert.match(text, /^as of 15 Sept?, /);
  assert.match(text, /(GMT|UTC|[A-Z]{2,5})/);
});
