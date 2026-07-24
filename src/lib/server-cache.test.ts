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
