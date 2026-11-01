import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  getIndexerFallbackState,
  isIndexerBypassed,
  resetIndexerFallbackForTests,
  withIndexerFallback,
} from "@/lib/indexer-fallback";

const originalWarn = console.warn;

describe("withIndexerFallback", () => {
  beforeEach(() => {
    resetIndexerFallbackForTests();
    delete process.env.INDEXER_API_FALLBACK;
    console.warn = () => {};
  });

  afterEach(() => {
    console.warn = originalWarn;
    delete process.env.INDEXER_API_FALLBACK;
  });

  it("returns the indexer result when it succeeds", async () => {
    let fallbackCalls = 0;
    const result = await withIndexerFallback(
      "test",
      async () => "indexer",
      async () => {
        fallbackCalls += 1;
        return "api";
      },
    );
    assert.equal(result, "indexer");
    assert.equal(fallbackCalls, 0);
    assert.equal(isIndexerBypassed(), false);
  });

  it("serves the fallback when the indexer fails and records why", async () => {
    const result = await withIndexerFallback(
      "test",
      async () => {
        throw new Error("connect ECONNREFUSED 1.2.3.4:5432");
      },
      async () => "api",
    );
    assert.equal(result, "api");
    const state = getIndexerFallbackState();
    assert.equal(state.bypassingIndexer, true);
    assert.equal(state.lastFailureReason, "connect ECONNREFUSED 1.2.3.4:5432");
    assert.notEqual(state.lastFallbackAt, null);
  });

  it("skips the indexer during the cooldown after a failure", async () => {
    await withIndexerFallback(
      "test",
      async () => {
        throw new Error("down");
      },
      async () => "api",
    );
    let primaryCalls = 0;
    const result = await withIndexerFallback(
      "test",
      async () => {
        primaryCalls += 1;
        return "indexer";
      },
      async () => "api",
    );
    assert.equal(result, "api");
    assert.equal(primaryCalls, 0);
  });

  it("tries the indexer again once the cooldown has passed", async () => {
    process.env.INDEXER_FALLBACK_COOLDOWN_MS = "1";
    try {
      await withIndexerFallback(
        "test",
        async () => {
          throw new Error("down");
        },
        async () => "api",
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
      const result = await withIndexerFallback(
        "test",
        async () => "indexer",
        async () => "api",
      );
      assert.equal(result, "indexer");
    } finally {
      delete process.env.INDEXER_FALLBACK_COOLDOWN_MS;
    }
  });

  it("propagates indexer errors when the fallback is off", async () => {
    process.env.INDEXER_API_FALLBACK = "off";
    await assert.rejects(
      withIndexerFallback(
        "test",
        async () => {
          throw new Error("down");
        },
        async () => "api",
      ),
      /down/,
    );
  });
});
