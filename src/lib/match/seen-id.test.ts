import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorSeenId, parseSeenId, postSeenId } from "./seen-id";

describe("postSeenId", () => {
  it("is stable for the same post", async () => {
    assert.equal(
      await postSeenId("traderA", "WTS CC101"),
      await postSeenId("traderA", "WTS CC101"),
    );
  });

  it("ignores case and whitespace, the way messageKey does", async () => {
    assert.equal(
      await postSeenId("traderA", "WTS   CC101\n\nCC102"),
      await postSeenId("  TraderA ", "wts cc101 cc102"),
    );
  });

  it("changes when a trader edits their list, so the post resurfaces", async () => {
    assert.notEqual(
      await postSeenId("traderA", "WTS CC101"),
      await postSeenId("traderA", "WTS CC102"),
    );
  });

  it("separates two traders posting the same list", async () => {
    assert.notEqual(
      await postSeenId("traderA", "WTS CC101"),
      await postSeenId("traderB", "WTS CC101"),
    );
  });

  it("is a hex sha256 under a post: prefix", async () => {
    assert.match(
      (await postSeenId("traderA", "WTS CC101")) ?? "",
      /^post:[0-9a-f]{64}$/,
    );
  });
});

describe("authorSeenId", () => {
  it("is stable and case-insensitive", async () => {
    assert.equal(
      await authorSeenId("traderA"),
      await authorSeenId(" TRADERa "),
    );
  });

  it("does not collide with a post id", async () => {
    assert.notEqual(
      await authorSeenId("traderA"),
      await postSeenId("traderA", ""),
    );
  });
});

describe("parseSeenId", () => {
  it("round-trips what we write", async () => {
    const id = (await postSeenId("traderA", "WTS CC101")) ?? "";
    assert.deepEqual(parseSeenId(id), { kind: "post", hash: id.slice(5) });
  });

  it("reads an author id", async () => {
    const id = (await authorSeenId("traderA")) ?? "";
    assert.equal(parseSeenId(id)?.kind, "author");
  });

  it("rejects anything else", () => {
    for (const bad of [
      undefined,
      42,
      "",
      "post:",
      "post:xyz",
      `post:${"a".repeat(63)}`,
      `post:${"A".repeat(64)}`,
      `other:${"a".repeat(64)}`,
      "a".repeat(64),
    ]) {
      assert.equal(parseSeenId(bad), null, `should reject ${String(bad)}`);
    }
  });
});
