import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createServerCache,
  getCached,
  getCachedStaleWhileRevalidate,
} from "@/lib/server-cache";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Busy pages write many cheap keys (one per objekt card). None of those writes
// may cost another key its stale value, its place, or its in-flight load.

test("stale-while-revalidate still serves stale after an unrelated write", async () => {
  const cache = createServerCache("test:swr-after-write");
  await cache.getCachedStaleWhileRevalidate("slow", 1, async () => "initial");
  await sleep(5);
  await cache.getCached("unrelated", 60_000, async () => "written");

  const refreshed = () =>
    new Promise<string>((resolve) => setTimeout(resolve, 20, "refreshed"));
  assert.equal(
    await cache.getCachedStaleWhileRevalidate("slow", 60_000, refreshed),
    "initial",
    "a write elsewhere must not turn the next read into a cold load",
  );
});

test("the failure backoff still serves stale after an unrelated write", async () => {
  const cache = createServerCache("test:backoff-after-write");
  let calls = 0;
  const load = async () => {
    calls += 1;
    if (calls === 1) return "cached";
    throw new Error("remote is down");
  };

  assert.equal(await cache.getCached("remote", 5, load), "cached");
  await sleep(20);
  await cache.getCached("unrelated", 60_000, async () => "written");

  assert.equal(await cache.getCached("remote", 5, load), "cached");
});

test("a key that keeps being read survives a stream of new keys", async () => {
  const cache = createServerCache("test:lru", { maxEntries: 3 });
  let hotLoads = 0;
  const hot = async () => {
    hotLoads += 1;
    return "hot";
  };

  await cache.getCached("hot", 60_000, hot);
  for (let i = 0; i < 10; i++) {
    await cache.getCached(`card:${i}`, 60_000, async () => i);
    await cache.getCached("hot", 60_000, hot);
  }
  assert.equal(hotLoads, 1, "the hot key is never evicted");

  let reloaded = false;
  await cache.getCached("card:0", 60_000, async () => {
    reloaded = true;
    return 0;
  });
  assert.ok(reloaded, "the budget still holds: old unread keys were evicted");
});

test("expired entries are evicted before live ones", async () => {
  const cache = createServerCache("test:expired-first", { maxEntries: 2 });
  let liveLoads = 0;
  const live = async () => {
    liveLoads += 1;
    return "live";
  };

  await cache.getCached("live", 60_000, live);
  await cache.getCached("expired", 1, async () => "expired");
  await sleep(5);
  await cache.getCached("new", 60_000, async () => "new");

  await cache.getCached("live", 60_000, live);
  assert.equal(liveLoads, 1);
});

test("an in-flight load is not evicted under pressure", async () => {
  const cache = createServerCache("test:pending", { maxEntries: 1 });
  let calls = 0;
  let finish: ((value: string) => void) | undefined;
  const slow = () => {
    calls += 1;
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  };

  const first = cache.getCached("slow", 60_000, slow);
  await cache.getCached("a", 60_000, async () => "a");
  await cache.getCached("b", 60_000, async () => "b");
  const second = cache.getCached("slow", 60_000, slow);

  assert.equal(calls, 1, "the second caller joins the first load");
  finish?.("done");
  assert.equal(await first, "done");
  assert.equal(await second, "done");
});

test("stale values are dropped once the retention window passes", async () => {
  const cache = createServerCache("test:retention", { staleRetentionMs: 10 });
  await cache.getCached("old", 1, async () => "old");
  await sleep(30);
  await cache.getCached("unrelated", 60_000, async () => "written");

  assert.equal(
    await cache.getCachedStaleWhileRevalidate("old", 60_000, async () => "new"),
    "new",
    "nothing that old is served",
  );
});

test("instances never evict each other's entries", async () => {
  const busy = createServerCache("test:isolation:busy", { maxEntries: 2 });
  const quiet = createServerCache("test:isolation:quiet", { maxEntries: 2 });
  let loads = 0;
  const expensive = async () => {
    loads += 1;
    return "expensive";
  };

  await quiet.getCached("expensive", 60_000, expensive);
  for (let i = 0; i < 10; i++) {
    await busy.getCached(`card:${i}`, 60_000, async () => i);
  }
  await quiet.getCached("expensive", 60_000, expensive);
  assert.equal(loads, 1);
});
