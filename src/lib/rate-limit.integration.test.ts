import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { hasTestDb, setupTestEnv, teardown } from "@/test/harness";

describe("rate-limit (integration)", {
  skip: !hasTestDb && "TEST_DATABASE_URL not set",
}, () => {
  let isRateLimited!: typeof import("@/lib/rate-limit").isRateLimited;
  let redis!: typeof import("@/lib/redis").redis;

  before(async () => {
    setupTestEnv();
    ({ isRateLimited } = await import("@/lib/rate-limit"));
    ({ redis } = await import("@/lib/redis"));
  });

  after(teardown);

  const key = "rate-limit:test:window";
  beforeEach(async () => {
    await redis.del(key);
  });

  it("allows up to the limit, then rejects", async () => {
    assert.equal(await isRateLimited(key, 3, 60), false);
    assert.equal(await isRateLimited(key, 3, 60), false);
    assert.equal(await isRateLimited(key, 3, 60), false);
    assert.equal(await isRateLimited(key, 3, 60), true, "fourth is over");
  });

  it("always leaves the counter with an expiry", async () => {
    await isRateLimited(key, 3, 60);
    assert.ok((await redis.ttl(key)) > 0, "first hit sets the window");
  });

  it("re-establishes a window that was lost, rather than locking forever", async () => {
    // What a dropped connection between INCR and EXPIRE leaves behind: a
    // counter at the limit with no expiry. Under the old code nothing ever
    // set one again, because the TTL was only written when the counter read
    // 1 — so this pair stayed rate-limited until someone deleted the key.
    await redis.set(key, "9");
    assert.equal(await redis.ttl(key), -1, "no expiry, as the bug leaves it");

    assert.equal(await isRateLimited(key, 3, 60), true, "still over");
    assert.ok((await redis.ttl(key)) > 0, "but the window is back");
  });

  it("does not let a repeat caller push the window back", async () => {
    await isRateLimited(key, 3, 60);
    await redis.expire(key, 5);
    await isRateLimited(key, 3, 60);
    assert.ok(
      (await redis.ttl(key)) <= 5,
      "NX leaves the original deadline alone",
    );
  });
});
