import assert from "node:assert/strict";
import { test } from "node:test";
import { getCached, getCachedStaleWhileRevalidate } from "@/lib/server-cache";

test("stale-while-revalidate waits for a cold load", async () => {
  const key = "server-cache:test:swr:cold";
  let resolveLoad: ((value: string) => void) | undefined;
  const pending = getCachedStaleWhileRevalidate(
    key,
    60_000,
    () =>
      new Promise<string>((resolve) => {
        resolveLoad = resolve;
      }),
  );

  let settled = false;
  void pending.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  resolveLoad?.("initial");
  assert.equal(await pending, "initial");
});

test("stale-while-revalidate returns stale data during one background refresh", async () => {
  const key = "server-cache:test:swr:refresh";
  assert.equal(
    await getCachedStaleWhileRevalidate(key, 1, async () => "initial"),
    "initial",
  );
  await new Promise((resolve) => setTimeout(resolve, 5));

  let refreshCount = 0;
  let resolveRefresh: ((value: string) => void) | undefined;
  const load = () => {
    refreshCount += 1;
    return new Promise<string>((resolve) => {
      resolveRefresh = resolve;
    });
  };

  assert.equal(
    await getCachedStaleWhileRevalidate(key, 60_000, load),
    "initial",
  );
  assert.equal(
    await getCachedStaleWhileRevalidate(key, 60_000, load),
    "initial",
  );
  assert.equal(refreshCount, 1);

  resolveRefresh?.("refreshed");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(
    await getCached(key, 60_000, async () => "unexpected"),
    "refreshed",
  );
});

test("a failed refresh backs off instead of re-hitting the remote", async () => {
  const key = "server-cache:test:backoff";
  let calls = 0;
  const load = async () => {
    calls += 1;
    if (calls === 1) return "cached";
    throw new Error("remote is down");
  };

  // A short TTL, waited out, so the next call has to go back to `load` —
  // which now fails.
  assert.equal(await getCached(key, 5, load), "cached");
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(await getCached(key, 5, load), "cached", "serves stale");
  assert.equal(calls, 2);

  // The failure path caches for a minute, well past this TTL. Without that
  // taking effect, every request during an indexer outage goes straight back
  // to the indexer — which is exactly when it can least afford them.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(await getCached(key, 5, load), "cached", "still serves stale");
  assert.equal(calls, 2, "the remote is not called again during the backoff");
});
