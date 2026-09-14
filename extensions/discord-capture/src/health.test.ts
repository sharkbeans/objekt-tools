import assert from "node:assert/strict";
import { test } from "node:test";
import { ENOUGH, HealthWatch, judge, STRIKES } from "./health";

const sample = (extra: Partial<Parameters<typeof judge>[0]> = {}) => ({
  elements: ENOUGH,
  readable: 0,
  capturing: true,
  ...extra,
});

test("a screenful of messages that none parse is breakage", () => {
  assert.deepEqual(judge(sample()), { state: "broken", elements: ENOUGH });
});

test("a paused channel reads nothing legitimately", () => {
  // The most common state there is; reporting it as breakage would cry wolf.
  assert.deepEqual(judge(sample({ capturing: false })), { state: "idle" });
});

test("one unreadable post is an attachment, not a broken parser", () => {
  assert.deepEqual(judge(sample({ elements: 1 })), { state: "idle" });
});

test("anything parsing at all means the selectors still work", () => {
  assert.deepEqual(judge(sample({ readable: 1 })), { state: "ok" });
});

test("one bad sample is not enough to raise the alarm", () => {
  const watch = new HealthWatch();
  assert.equal(watch.add(sample()), null, "a page caught mid-render");
  assert.deepEqual(watch.add(sample()), { state: "broken", elements: ENOUGH });
});

test("it reports once, not on every sample after", () => {
  const watch = new HealthWatch();
  for (let i = 0; i < STRIKES - 1; i++) watch.add(sample());
  assert.ok(watch.add(sample()));
  assert.equal(watch.add(sample()), null);
  assert.equal(watch.add(sample()), null);
});

test("recovering is reported too, so the warning can be taken down", () => {
  const watch = new HealthWatch();
  for (let i = 0; i < STRIKES; i++) watch.add(sample());
  assert.deepEqual(watch.add(sample({ readable: 3 })), { state: "ok" });
  // And having recovered, it stays quiet.
  assert.equal(watch.add(sample({ readable: 3 })), null);
});

test("a good sample resets the run, so strikes cannot accumulate all day", () => {
  const watch = new HealthWatch();
  watch.add(sample());
  watch.add(sample({ readable: 2 }));
  assert.equal(watch.add(sample()), null, "the earlier strike was cleared");
});
