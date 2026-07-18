import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRecycleOnError } from "@/lib/db/indexer";

const checkoutTimeout = new Error("timeout exceeded when trying to connect");

describe("shouldRecycleOnError", () => {
  it("recycles on a checkout timeout when every client is checked out", () => {
    assert.equal(
      shouldRecycleOnError(checkoutTimeout, { totalCount: 8, idleCount: 0 }),
      true,
    );
  });

  it("does not recycle when idle clients remain", () => {
    assert.equal(
      shouldRecycleOnError(checkoutTimeout, { totalCount: 8, idleCount: 3 }),
      false,
    );
  });

  it("does not recycle when the pool holds no clients (server unreachable)", () => {
    assert.equal(
      shouldRecycleOnError(checkoutTimeout, { totalCount: 0, idleCount: 0 }),
      false,
    );
  });

  it("ignores other errors even at full checkout", () => {
    assert.equal(
      shouldRecycleOnError(new Error("Query read timeout"), {
        totalCount: 8,
        idleCount: 0,
      }),
      false,
    );
    assert.equal(
      shouldRecycleOnError("timeout exceeded when trying to connect", {
        totalCount: 8,
        idleCount: 0,
      }),
      false,
    );
  });
});
