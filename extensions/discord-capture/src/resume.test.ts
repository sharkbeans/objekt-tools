import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_TRIES,
  nextPending,
  type PendingRun,
  planResume,
  RESUME_WINDOW_MS,
  readPendingRun,
} from "./resume";

const NOW = 1_700_000_000_000;

function pending(over: Partial<PendingRun> = {}): PendingRun {
  return {
    run: "run-1",
    queries: ["a cc101", "b cc201", "c aa101"],
    done: 1,
    pages: 5,
    delayMs: 0,
    planNote: "3 codes",
    tab: 7,
    tries: 0,
    at: NOW,
    ...over,
  };
}

test("a stored run round-trips", () => {
  const read = readPendingRun(JSON.parse(JSON.stringify(pending())));
  assert.deepEqual(read, pending());
});

test("anything that is not a run is refused rather than half-read", () => {
  for (const bad of [
    null,
    undefined,
    "run-1",
    {},
    { run: "", queries: ["a"], done: 0, at: NOW },
    { run: "r", queries: [], done: 0, at: NOW },
    { run: "r", queries: ["a", 2], done: 0, at: NOW },
    { run: "r", queries: ["a"], done: 5, at: NOW },
    { run: "r", queries: ["a"], done: -1, at: NOW },
    { run: "r", queries: ["a"], done: 0, at: "yesterday" },
  ])
    assert.equal(readPendingRun(bad), null, JSON.stringify(bad));
});

test("resuming starts at the query that was in flight, not after it", () => {
  const plan = planResume(pending({ done: 1 }), 7, NOW + 1000);
  assert.equal(plan.action, "run");
  if (plan.action !== "run") return;
  // Query index 1 went down with the tab, so it is retried rather than lost.
  assert.deepEqual(plan.queries, ["b cc201", "c aa101"]);
  assert.equal(plan.done, 1);
  assert.equal(plan.skipped, null);
});

test("a query that keeps killing the tab is stepped over, once", () => {
  const plan = planResume(pending({ done: 1, tries: MAX_TRIES }), 7, NOW);
  assert.equal(plan.action, "run");
  if (plan.action !== "run") return;
  assert.equal(plan.skipped, "b cc201");
  assert.deepEqual(plan.queries, ["c aa101"]);
  assert.equal(plan.done, 2);
});

test("skipping the last query leaves nothing to resume", () => {
  const plan = planResume(pending({ done: 2, tries: MAX_TRIES }), 7, NOW);
  assert.equal(plan.action, "drop");
});

test("a run left overnight is not picked up by tomorrow's tab", () => {
  const fresh = planResume(pending(), 7, NOW + RESUME_WINDOW_MS - 1);
  assert.equal(fresh.action, "run");
  const stale = planResume(pending(), 7, NOW + RESUME_WINDOW_MS + 1);
  assert.equal(stale.action, "drop");
});

test("a second Discord tab does not adopt the first one's run", () => {
  assert.equal(planResume(pending({ tab: 7 }), 9, NOW).action, "drop");
  assert.equal(planResume(pending({ tab: 7 }), 7, NOW).action, "run");
});

test("a run with no tab recorded is adoptable, because a crash renumbers it", () => {
  assert.equal(planResume(pending({ tab: null }), 9, NOW).action, "run");
  assert.equal(planResume(pending({ tab: 7 }), null, NOW).action, "run");
});

test("nothing pending is a drop, not a throw", () => {
  assert.equal(planResume(null, 7, NOW).action, "drop");
});

test("retrying the same query counts up; moving on starts over", () => {
  const state = pending({ done: 1, tries: 1 });
  assert.equal(nextPending(state, 1, 7, NOW).tries, 2);
  // Stepping over the poisoned query is progress, so the next one gets its own
  // budget rather than inheriting a count it did not earn.
  assert.equal(nextPending(state, 2, 7, NOW).tries, 1);
});

test("a resume records the tab it is now running in", () => {
  assert.equal(nextPending(pending({ tab: 7 }), 1, 12, NOW).tab, 12);
});
