import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describePlan,
  loadHue,
  pageBudget,
  planQueries,
  pruneSearchedAt,
  QUERY_CAP,
  RECOMMENDED_DELAY_MS,
  RECOMMENDED_PAGE_BUDGET,
  readSearchedAt,
  recommendedTuning,
  searchFilters,
  searchLoad,
} from "./search-plan";

test("search filters ignore code order and duplicates", () => {
  assert.equal(
    searchFilters(["CC102", "CC101", "CC101"], 3),
    searchFilters(["CC101", "CC102"], 3),
  );
});

test("a different code or page depth is a different search", () => {
  const base = searchFilters(["CC101", "CC102"], 3);
  assert.notEqual(searchFilters(["CC101"], 3), base);
  assert.notEqual(searchFilters(["CC101", "CC102", "CC103"], 3), base);
  assert.notEqual(searchFilters(["CC101", "CC102"], 5), base);
});

test("the recommended pace gets the recommended page budget", () => {
  assert.equal(pageBudget(RECOMMENDED_DELAY_MS), RECOMMENDED_PAGE_BUDGET);
});

test("a faster pace gets fewer pages, a slower one more", () => {
  assert.ok(pageBudget(0) < RECOMMENDED_PAGE_BUDGET);
  assert.ok(pageBudget(15_000) > RECOMMENDED_PAGE_BUDGET);
  assert.equal(pageBudget(-1_000), pageBudget(0));
});

test("many pages of one objekt is not a warning on its own", () => {
  assert.equal(searchLoad(1, 10, RECOMMENDED_DELAY_MS).over, false);
  assert.equal(searchLoad(1, 20, 0).over, false);
});

test("a fast pace is not a warning on its own", () => {
  assert.equal(searchLoad(5, 2, 0).over, false);
});

test("the slider hue runs green to orange, and red only past the budget", () => {
  assert.equal(loadHue({ pages: 0, budget: 60 }), 120);
  assert.equal(loadHue({ pages: 30, budget: 60 }), 75);
  assert.equal(loadHue({ pages: 60, budget: 60 }), 30);
  assert.equal(loadHue({ pages: 61, budget: 60 }), 0);
});

test("codes, pages and pace together decide the warning", () => {
  assert.equal(searchLoad(30, 2, RECOMMENDED_DELAY_MS).over, false);
  assert.equal(searchLoad(30, 3, RECOMMENDED_DELAY_MS).over, true);
  assert.equal(searchLoad(30, 3, 15_000).over, false);
  assert.equal(searchLoad(20, 2, 0).over, true);
  assert.deepEqual(searchLoad(0, 20, 0), {
    pages: 0,
    budget: pageBudget(0),
    over: false,
    estimatedMs: 0,
  });
});

test("the time estimate scales with pages walked and pace", () => {
  assert.equal(searchLoad(4, 3, 5_000).estimatedMs, 4 * 3 * 9_000);
  assert.equal(searchLoad(0, 20, 5_000).estimatedMs, 0);
});

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

test("recommends deep and gentle for a few codes, shallow and slower for many", () => {
  assert.deepEqual(recommendedTuning(3), { pages: 10, delaySeconds: 5 });
  assert.deepEqual(recommendedTuning(10), { pages: 6, delaySeconds: 5 });
  const many = recommendedTuning(40);
  assert.equal(many.pages, 3);
  assert.ok(many.delaySeconds > 5, "40 codes needs a slower pace");
  // Whatever it picks stays inside the budget it warns about.
  for (const codes of [1, 5, 6, 10, 11, 20, 21, 40]) {
    const rec = recommendedTuning(codes);
    assert.equal(
      searchLoad(codes, rec.pages, rec.delaySeconds * 1000).over,
      false,
      `${codes} codes`,
    );
  }
});

test("a carried-over pace is paid while it eases off, not on every page", () => {
  // 16 pages at Instant with a 4s page: flat is 64s.
  assert.equal(searchLoad(16, 1, 0, null).estimatedMs, 64_000);
  // Starting at +2s: 8 pages at 2s, then 8 at 1s — not 16 at 2s.
  assert.equal(searchLoad(16, 1, 0, null, 2_000).estimatedMs, 64_000 + 24_000);
});
