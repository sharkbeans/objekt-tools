import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describePlan,
  planQueries,
  pruneSearchedAt,
  QUERY_CAP,
  readSearchedAt,
} from "./search-plan";

const hour = 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 10, 12);

test("everything runs when nothing has been searched", () => {
  const plan = planQueries(["CC101", "CC201"], { cooldownMs: 6 * hour, now });
  assert.deepEqual(plan.queries, ["CC101", "CC201"]);
  assert.deepEqual(plan.skipped, []);
  assert.equal(describePlan(plan), "");
});

test("skips codes searched inside the cooldown, keeps the rest", () => {
  const searched = new Map([
    ["CC101", now - hour],
    ["CC201", now - 9 * hour],
  ]);
  const plan = planQueries(["CC101", "CC201", "AA101"], {
    searched,
    cooldownMs: 6 * hour,
    now,
  });
  assert.deepEqual(plan.queries, ["CC201", "AA101"]);
  assert.deepEqual(plan.skipped, ["CC101"]);
  assert.match(describePlan(plan), /1 searched recently/);
});

test("a cooldown of zero searches everything, however recent", () => {
  const searched = new Map([["CC101", now - 1]]);
  const plan = planQueries(["CC101"], { searched, cooldownMs: 0, now });
  assert.deepEqual(plan.queries, ["CC101"]);
});

test("caps a pasted want list rather than firing all of it", () => {
  const many = Array.from({ length: QUERY_CAP + 7 }, (_, i) => `CC${i}`);
  const plan = planQueries(many, { now });
  assert.equal(plan.queries.length, QUERY_CAP);
  assert.equal(plan.overflow.length, 7);
  assert.match(describePlan(plan), /over the 40-code limit/);
});

test("the cap is spent on codes that have not been searched", () => {
  // A repeat run must make progress through the list, not re-run its start.
  const many = Array.from({ length: QUERY_CAP + 15 }, (_, i) => `CC${i}`);
  const searched = new Map(many.slice(0, 10).map((q) => [q, now - hour]));
  const plan = planQueries(many, { searched, cooldownMs: 6 * hour, now });
  assert.equal(plan.queries.length, QUERY_CAP);
  assert.equal(plan.queries[0], "CC10", "starts where the last run left off");
  assert.equal(plan.overflow.length, 5);
});

test("reads a stored map, ignoring anything that is not a timestamp", () => {
  const searched = readSearchedAt({
    CC101: now,
    CC201: "yesterday",
    AA101: Number.NaN,
    BB101: -1,
  });
  assert.deepEqual([...searched], [["CC101", now]]);
  assert.deepEqual([...readSearchedAt(null)], []);
});

test("prunes entries that have outlived the cooldown", () => {
  const searched = new Map([
    ["CC101", now - hour],
    ["CC201", now - 30 * hour],
  ]);
  assert.deepEqual(pruneSearchedAt(searched, 6 * hour, now), {
    CC101: now - hour,
  });
});
