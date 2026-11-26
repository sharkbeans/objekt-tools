import assert from "node:assert/strict";
import { test } from "node:test";
import { islandView, RESULT_SHOWN_MS } from "./island";
import { STALE_MS } from "./resume";

const NOW = 1_800_000_000_000;

test("no run yet is the plain island", () => {
  assert.equal(islandView(undefined, NOW).state, "idle");
  assert.equal(islandView("nonsense", NOW).label, "Objekt Match");
});

test("a running search names the code in hand and how far it has got", () => {
  const view = islandView(
    { running: true, at: NOW - 1000, query: "CC103", done: 3, total: 9 },
    NOW,
  );
  assert.equal(view.state, "running");
  assert.equal(view.label, "Searching CC103");
  assert.equal(view.meta, "3/9");
  assert.equal(view.progress, 3 / 9);
  assert.equal(view.canOpen, false);
});

test("a held run says so rather than claiming to search", () => {
  const base = { running: true, at: NOW, query: "CC103", done: 1, total: 4 };
  assert.equal(
    islandView({ ...base, paused: "Paused: you left #trade." }, NOW).label,
    "Paused",
  );
  assert.equal(
    islandView({ ...base, waiting: true }, NOW).label,
    "Waiting for Discord",
  );
});

test("a run whose reports stopped arriving is interrupted, not searching", () => {
  const view = islandView(
    { running: true, at: NOW - STALE_MS, query: "CC103", posts: 4 },
    NOW,
  );
  assert.equal(view.state, "stopped");
  assert.equal(view.label, "Search interrupted");
  assert.equal(view.canOpen, true);
});

test("a finished search offers its posts", () => {
  const view = islandView(
    { running: false, finishedAt: NOW - 5000, posts: 12, done: 9, total: 9 },
    NOW,
  );
  assert.equal(view.state, "done");
  assert.equal(view.label, "12 posts found");
  assert.equal(view.canOpen, true);
  const one = islandView({ running: false, finishedAt: NOW, posts: 1 }, NOW);
  assert.equal(one.label, "1 post found");
});

test("a search that found nothing has nothing to open", () => {
  const view = islandView({ running: false, finishedAt: NOW, posts: 0 }, NOW);
  assert.equal(view.label, "Nothing new found");
  assert.equal(view.canOpen, false);
});

test("a stopped search still offers what it found", () => {
  const view = islandView(
    { running: false, finishedAt: NOW, posts: 3, stopped: "Stopped." },
    NOW,
  );
  assert.equal(view.state, "stopped");
  assert.equal(view.meta, "3 posts");
  assert.equal(view.canOpen, true);
});

test("an old result goes back to the plain island", () => {
  const view = islandView(
    { running: false, finishedAt: NOW - RESULT_SHOWN_MS, posts: 12 },
    NOW,
  );
  assert.equal(view.state, "idle");
});
