import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MirrorFallbackPool } from "@/lib/db/indexer-mirror";

type FakePool = {
  connect: () => Promise<never>;
  idleCount: number;
  query: (...args: unknown[]) => Promise<unknown>;
  totalCount: number;
  waitingCount: number;
};

function createFakePool(
  query: (...args: unknown[]) => Promise<unknown>,
): FakePool {
  return {
    query,
    connect: async () => {
      throw new Error("connect not implemented in test");
    },
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0,
  };
}

describe("MirrorFallbackPool", () => {
  it("returns mirror results and clears prior failures after a success", async () => {
    const runtime = {
      consecutiveFailures: 2,
      bypassUntilMs: 0,
      lastFailureAtMs: 1000,
      lastFailureReason: "timeout",
    };

    const pool = new MirrorFallbackPool({
      getMirrorPool: () =>
        createFakePool(async () => ({ rows: [{ via: "mirror" }] })),
      getRemotePool: () =>
        createFakePool(async () => ({ rows: [{ via: "remote" }] })),
      isMirrorEnabled: () => true,
      runtime,
      warn: () => {},
      now: () => 2000,
      failureThreshold: 3,
      cooldownMs: 30_000,
    });

    const result = (await pool.query("select 1")) as {
      rows: Array<{ via: string }>;
    };

    assert.equal(result.rows[0]?.via, "mirror");
    assert.equal(runtime.consecutiveFailures, 0);
    assert.equal(runtime.bypassUntilMs, 0);
    assert.equal(runtime.lastFailureReason, "timeout");
  });

  it("falls back to remote on mirror failure and opens the circuit after the threshold", async () => {
    let now = 1000;
    let mirrorCalls = 0;
    let remoteCalls = 0;
    const warnings: string[] = [];
    const runtime = {
      consecutiveFailures: 0,
      bypassUntilMs: 0,
      lastFailureAtMs: null,
      lastFailureReason: null,
    };

    const pool = new MirrorFallbackPool({
      getMirrorPool: () =>
        createFakePool(async () => {
          mirrorCalls += 1;
          throw new Error("Query read timeout");
        }),
      getRemotePool: () =>
        createFakePool(async () => {
          remoteCalls += 1;
          return { rows: [{ via: "remote" }] };
        }),
      isMirrorEnabled: () => true,
      runtime,
      warn: (message) => warnings.push(message),
      now: () => now,
      failureThreshold: 2,
      cooldownMs: 30_000,
    });

    const first = (await pool.query("select 1")) as {
      rows: Array<{ via: string }>;
    };
    assert.equal(first.rows[0]?.via, "remote");
    assert.equal(runtime.consecutiveFailures, 1);
    assert.equal(runtime.bypassUntilMs, 0);

    now = 2000;
    const second = (await pool.query("select 1")) as {
      rows: Array<{ via: string }>;
    };
    assert.equal(second.rows[0]?.via, "remote");
    assert.equal(runtime.consecutiveFailures, 2);
    assert.equal(runtime.bypassUntilMs, 32_000);

    now = 2500;
    const third = (await pool.query("select 1")) as {
      rows: Array<{ via: string }>;
    };
    assert.equal(third.rows[0]?.via, "remote");
    assert.equal(mirrorCalls, 2);
    assert.equal(remoteCalls, 3);
    assert.equal(warnings.length, 2);
  });

  it("resets the failure streak after the cooldown expires before probing the mirror again", async () => {
    let now = 50_000;
    let mirrorCalls = 0;
    const runtime = {
      consecutiveFailures: 2,
      bypassUntilMs: 51_000,
      lastFailureAtMs: 49_000,
      lastFailureReason: "timeout",
    };

    const pool = new MirrorFallbackPool({
      getMirrorPool: () =>
        createFakePool(async () => {
          mirrorCalls += 1;
          throw new Error("mirror still down");
        }),
      getRemotePool: () =>
        createFakePool(async () => ({ rows: [{ via: "remote" }] })),
      isMirrorEnabled: () => true,
      runtime,
      warn: () => {},
      now: () => now,
      failureThreshold: 2,
      cooldownMs: 30_000,
    });

    now = 52_000;
    await pool.query("select 1");

    assert.equal(mirrorCalls, 1);
    assert.equal(runtime.consecutiveFailures, 1);
    assert.equal(runtime.bypassUntilMs, 0);
    assert.equal(runtime.lastFailureReason, "mirror still down");
  });
});
