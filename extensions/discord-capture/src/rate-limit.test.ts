import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatLockout,
  lockoutMessage,
  lockoutRemaining,
  RATE_LIMIT_LOCKOUT_MS,
  readRateLimitedAt,
} from "./rate-limit";

const NOW = 1_700_000_000_000;

test("blocks for ten minutes after a rate limit, then lets go", () => {
  assert.equal(lockoutRemaining(NOW, NOW), RATE_LIMIT_LOCKOUT_MS);
  assert.equal(lockoutRemaining(NOW, NOW + 60_000), 9 * 60_000);
  assert.equal(lockoutRemaining(NOW, NOW + RATE_LIMIT_LOCKOUT_MS), 0);
  assert.equal(lockoutRemaining(NOW, NOW + 3 * RATE_LIMIT_LOCKOUT_MS), 0);
});

test("never blocks without a recorded rate limit", () => {
  assert.equal(lockoutRemaining(null, NOW), 0);
  assert.equal(readRateLimitedAt(undefined), null);
  assert.equal(readRateLimitedAt("1700000000000"), null);
  assert.equal(readRateLimitedAt(Number.NaN), null);
  assert.equal(readRateLimitedAt(NOW), NOW);
});

test("a clock that moved backwards blocks no longer than the cool-down", () => {
  assert.equal(lockoutRemaining(NOW + 3_600_000, NOW), RATE_LIMIT_LOCKOUT_MS);
});

test("counts down in minutes and seconds, rounding up", () => {
  assert.equal(formatLockout(RATE_LIMIT_LOCKOUT_MS), "10:00");
  assert.equal(formatLockout(462_000), "7:42");
  assert.equal(formatLockout(1), "0:01");
  assert.match(lockoutMessage(462_000), /rate-limited.*7:42/);
});
