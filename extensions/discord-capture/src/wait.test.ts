import assert from "node:assert/strict";
import { test } from "node:test";
import { waitFor } from "./wait";

/** A promise plus the handle to settle it, so a test decides the ordering. */
function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((ok, no) => {
    resolve = ok;
    reject = (error) => no(error);
  });
  return { promise, resolve, reject };
}

test("a visible page uses its own timer and never messages the worker", async () => {
  let asked = 0;
  await waitFor(150, {
    hidden: () => false,
    local: async () => {},
    remote: async () => {
      asked++;
    },
  });
  assert.equal(asked, 0);
});

test("a hidden page takes whichever timer finishes first", async () => {
  const local = deferred();
  const remote = deferred();
  let done = false;
  const waiting = waitFor(150, {
    hidden: () => true,
    local: () => local.promise,
    remote: () => remote.promise,
  }).then(() => {
    done = true;
  });
  // The worker answers first, which is the whole point: its timer is not
  // throttled and the page's is.
  remote.resolve();
  await waiting;
  assert.equal(done, true);
  local.resolve();
});

test("a worker that never answers costs latency, not a stalled run", async () => {
  const local = deferred();
  const waiting = waitFor(150, {
    hidden: () => true,
    local: () => local.promise,
    remote: () => new Promise<void>(() => {}),
  });
  local.resolve();
  await waiting;
});

test("a worker that refuses does not reject the wait", async () => {
  const local = deferred();
  const waiting = waitFor(150, {
    hidden: () => true,
    local: () => local.promise,
    remote: async () => {
      throw new Error("Extension context invalidated");
    },
  });
  // The rejection arrives long before the local timer; the wait must still be
  // pending rather than failed, because a rejected wait aborts the run.
  await Promise.resolve();
  let settled = false;
  void waiting.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false, "a dead worker must not end the wait early");
  local.resolve();
  await waiting;
});

test("a zero or negative wait resolves without a timer at all", async () => {
  let timers = 0;
  const parts = {
    hidden: () => true,
    local: async () => {
      timers++;
    },
    remote: async () => {
      timers++;
    },
  };
  await waitFor(0, parts);
  await waitFor(-5, parts);
  await waitFor(Number.NaN, parts);
  assert.equal(timers, 0);
});
