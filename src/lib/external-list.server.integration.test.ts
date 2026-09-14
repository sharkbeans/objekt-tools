import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";

// Every cache miss spends from a Redis-backed budget shared by all users, so
// these run against a real Redis.
describe("importExternalList (integration)", {
  skip: !process.env.TEST_REDIS_URL && "TEST_REDIS_URL not set",
}, () => {
  let lists!: typeof import("@/lib/external-list.server");
  let redis!: typeof import("@/lib/redis").redis;
  const budgetKey = "rate-limit:external-lists:upstream";

  before(async () => {
    process.env.REDIS_URL = process.env.TEST_REDIS_URL;
    lists = await import("@/lib/external-list.server");
    ({ redis } = await import("@/lib/redis"));
  });

  beforeEach(async () => {
    mock.restoreAll();
    await redis.del(budgetKey);
  });

  after(async () => {
    mock.restoreAll();
    await redis.del(budgetKey);
    redis.disconnect();
  });

  it("serves a working list from cache", async () => {
    const fetch = mock.method(globalThis, "fetch", async () =>
      Response.json({
        json: [{ member: "SeoYeon", season: "Binary02", collectionNo: "322Z" }],
      }),
    );
    const url = "https://objekt.top/list/cached-list";
    const first = await lists.importExternalList(url);
    const second = await lists.importExternalList(url);
    assert.equal(first.items.length, 1);
    assert.deepEqual(second, first);
    assert.equal(fetch.mock.callCount(), 1);
  });

  it("remembers a missing list instead of asking the site again", async () => {
    const fetch = mock.method(
      globalThis,
      "fetch",
      async () => new Response("not found", { status: 404 }),
    );
    const url = "https://objekt.top/list/made-up-slug";
    const missing = (error: unknown) =>
      error instanceof lists.ExternalListImportError &&
      !(error instanceof lists.ExternalListUnavailableError) &&
      error.message === "objekt.top could not open this list (404).";

    await assert.rejects(lists.importExternalList(url), missing);
    await assert.rejects(lists.importExternalList(url), missing);
    assert.equal(fetch.mock.callCount(), 1);
  });

  it("retries after a network failure or an upstream outage", async () => {
    const offline = mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const url = "https://apollo.cafe/list/flaky-list";
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        lists.importExternalList(url),
        lists.ExternalListUnavailableError,
      );
    }
    assert.equal(offline.mock.callCount(), 2);

    mock.restoreAll();
    const down = mock.method(
      globalThis,
      "fetch",
      async () => new Response("bad gateway", { status: 503 }),
    );
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        lists.importExternalList(url),
        lists.ExternalListUnavailableError,
      );
    }
    assert.equal(down.mock.callCount(), 2);
  });

  it("never has more than six requests out to the sites at once", async () => {
    let open = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    mock.method(globalThis, "fetch", async () => {
      open += 1;
      peak = Math.max(peak, open);
      await new Promise<void>((resolve) => release.push(resolve));
      open -= 1;
      return Response.json({ json: [] });
    });

    let finished = false;
    const all = Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        lists.importExternalList(`https://objekt.top/list/burst-${i}`),
      ),
    ).finally(() => {
      finished = true;
    });
    // Release one request at a time, giving queued imports a moment to reach
    // the site in between. Bounded, so a limiter that loses a slot fails the
    // test instead of hanging it.
    for (let tick = 0; tick < 400 && !finished; tick++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      release.shift()?.();
    }

    assert.ok(finished, "every queued import eventually ran");
    assert.equal((await all).length, 10);
    assert.equal(peak, 6);
  });

  it("stops before reaching the site once the shared budget is spent", async () => {
    const fetch = mock.method(globalThis, "fetch", async () =>
      Response.json({ json: [] }),
    );
    await redis.set(budgetKey, "240", "EX", 60);

    await assert.rejects(
      lists.importExternalList("https://objekt.top/list/over-budget"),
      lists.ExternalListBusyError,
    );
    assert.equal(fetch.mock.callCount(), 0);
  });
});
