import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXTENSION_SOURCE,
  MAX_HANDOFF_CHARS,
  PAGE_SOURCE,
  readExtensionMessage,
  readPageMessage,
} from "@/lib/match/extension-handoff";

const delivery = {
  source: EXTENSION_SOURCE,
  type: "import",
  id: "run-abc123",
  transcript: "trader — 2026-09-09T03:41:00.000Z\nHAVE\nSeoYeon CC101",
  nickname: "yourcosmoname",
  wants: "SeoYeon CC101",
};

describe("readExtensionMessage", () => {
  it("accepts a delivery and a hello", () => {
    assert.deepEqual(readExtensionMessage(delivery), delivery);
    assert.deepEqual(
      readExtensionMessage({ source: EXTENSION_SOURCE, type: "hello" }),
      {
        source: EXTENSION_SOURCE,
        type: "hello",
      },
    );
  });

  it("ignores everything else on the window channel", () => {
    for (const noise of [
      null,
      "objekt-capture",
      { type: "import" },
      { source: PAGE_SOURCE, type: "ready" },
      { source: "react-devtools-bridge", payload: {} },
    ])
      assert.equal(readExtensionMessage(noise), null);
  });

  it("refuses a delivery with nothing usable in it", () => {
    assert.equal(
      readExtensionMessage({ ...delivery, transcript: "  \n" }),
      null,
    );
    assert.equal(readExtensionMessage({ ...delivery, transcript: 42 }), null);
    assert.equal(readExtensionMessage({ ...delivery, id: "" }), null);
    assert.equal(readExtensionMessage({ ...delivery, id: "has spaces" }), null);
    assert.equal(
      readExtensionMessage({
        ...delivery,
        transcript: "x".repeat(MAX_HANDOFF_CHARS + 1),
      }),
      null,
    );
  });

  it("tolerates missing optional fields", () => {
    const { nickname: _n, wants: _w, ...bare } = delivery;
    assert.deepEqual(readExtensionMessage(bare), {
      ...bare,
      nickname: "",
      wants: "",
    });
  });
});

describe("readPageMessage", () => {
  it("reads ready and received", () => {
    assert.deepEqual(readPageMessage({ source: PAGE_SOURCE, type: "ready" }), {
      source: PAGE_SOURCE,
      type: "ready",
    });
    assert.deepEqual(
      readPageMessage({
        source: PAGE_SOURCE,
        type: "received",
        id: "a",
        posts: 3,
      }),
      { source: PAGE_SOURCE, type: "received", id: "a", posts: 3 },
    );
  });

  it("does not mistake the extension's own messages for the page's", () => {
    assert.equal(readPageMessage(delivery), null);
    assert.equal(
      readPageMessage({ source: PAGE_SOURCE, type: "received", id: "a" }),
      null,
    );
  });
});
