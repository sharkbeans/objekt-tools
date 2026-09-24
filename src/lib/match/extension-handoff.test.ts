import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXTENSION_SOURCE,
  isHuntNickname,
  MAX_HANDOFF_CHARS,
  MAX_HUNT_LINE_CHARS,
  MAX_HUNT_LINES,
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
  links: { "0a1b2c3d": "https://discord.com/channels/700/800/456" },
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
    const { nickname: _n, wants: _w, links: _l, ...bare } = delivery;
    assert.deepEqual(readExtensionMessage(bare), {
      ...bare,
      nickname: "",
      wants: "",
      links: {},
    });
  });

  it("keeps only links that open a Discord message", () => {
    const message = readExtensionMessage({
      ...delivery,
      links: {
        "0a1b2c3d": "https://discord.com/channels/700/800/456",
        "11111111": "https://evil.example/channels/1/2/3",
        "22222222": "javascript:alert(1)",
        "not-a-key": "https://discord.com/channels/700/800/457",
        "33333333": 42,
      },
    });
    assert.deepEqual(message?.type === "import" && message.links, {
      "0a1b2c3d": "https://discord.com/channels/700/800/456",
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
    assert.equal(
      readPageMessage({ source: EXTENSION_SOURCE, type: "ping" }),
      null,
    );
  });

  it("reads a ping", () => {
    assert.deepEqual(readPageMessage({ source: PAGE_SOURCE, type: "ping" }), {
      source: PAGE_SOURCE,
      type: "ping",
    });
  });
});

describe("readPageMessage: hunt", () => {
  const hunt = {
    source: PAGE_SOURCE,
    type: "hunt",
    id: "hunt-k2x9",
    wants: "SeoYeon CC103\nSeoYeon CC104",
    nickname: "sjarkbean",
  };

  it("accepts a well-formed hunt, cleaning blank lines and padding", () => {
    assert.deepEqual(readPageMessage(hunt), hunt);
    assert.deepEqual(
      readPageMessage({
        ...hunt,
        wants: "\n  SeoYeon CC103 \n\n SeoYeon CC104\n",
        nickname: " sjarkbean ",
      }),
      hunt,
    );
    assert.deepEqual(readPageMessage({ ...hunt, nickname: "" }), {
      ...hunt,
      nickname: "",
    });
  });

  it("refuses the wrong source", () => {
    assert.equal(readPageMessage({ ...hunt, source: EXTENSION_SOURCE }), null);
    assert.equal(readPageMessage({ ...hunt, source: undefined }), null);
  });

  it("refuses a bad id", () => {
    for (const id of ["", "has spaces", "x".repeat(65), 7, undefined])
      assert.equal(readPageMessage({ ...hunt, id }), null, String(id));
  });

  it("refuses an empty or oversize want list", () => {
    assert.equal(readPageMessage({ ...hunt, wants: " \n " }), null);
    assert.equal(readPageMessage({ ...hunt, wants: 42 }), null);
    const lines = (n: number) =>
      Array.from({ length: n }, (_, i) => `SeoYeon CC${101 + i}`).join("\n");
    assert.equal(
      readPageMessage({ ...hunt, wants: lines(MAX_HUNT_LINES) })?.type,
      "hunt",
    );
    assert.equal(
      readPageMessage({ ...hunt, wants: lines(MAX_HUNT_LINES + 1) }),
      null,
    );
    assert.equal(
      readPageMessage({
        ...hunt,
        wants: `SeoYeon CC101\n${"x".repeat(MAX_HUNT_LINE_CHARS + 1)}`,
      }),
      null,
    );
    assert.equal(
      readPageMessage({ ...hunt, wants: "a".repeat(1_000_000) }),
      null,
    );
  });

  it("refuses a nickname outside the Cosmo charset or too long", () => {
    for (const nickname of ["has space", "<script>", "x".repeat(33), "a/b", 42])
      assert.equal(
        readPageMessage({ ...hunt, nickname }),
        null,
        String(nickname),
      );
    assert.equal(isHuntNickname("x".repeat(32)), true);
    assert.equal(isHuntNickname(""), true);
  });
});

describe("readExtensionMessage: bridge replies", () => {
  it("reads present and hunt-saved", () => {
    assert.deepEqual(
      readExtensionMessage({
        source: EXTENSION_SOURCE,
        type: "present",
        version: "1.2.0",
      }),
      { source: EXTENSION_SOURCE, type: "present", version: "1.2.0" },
    );
    assert.deepEqual(
      readExtensionMessage({
        source: EXTENSION_SOURCE,
        type: "hunt-saved",
        id: "hunt-k2x9",
        count: 4,
      }),
      {
        source: EXTENSION_SOURCE,
        type: "hunt-saved",
        id: "hunt-k2x9",
        count: 4,
      },
    );
  });

  it("refuses malformed replies and the wrong source", () => {
    for (const noise of [
      { source: PAGE_SOURCE, type: "present", version: "1.2.0" },
      { source: EXTENSION_SOURCE, type: "present" },
      { source: EXTENSION_SOURCE, type: "present", version: "<b>1</b>" },
      { source: EXTENSION_SOURCE, type: "hunt-saved", id: "a b", count: 1 },
      { source: EXTENSION_SOURCE, type: "hunt-saved", id: "a", count: -1 },
      { source: EXTENSION_SOURCE, type: "hunt-saved", id: "a", count: 1.5 },
      {
        source: EXTENSION_SOURCE,
        type: "hunt-saved",
        id: "a",
        count: MAX_HUNT_LINES + 1,
      },
    ])
      assert.equal(readExtensionMessage(noise), null, JSON.stringify(noise));
  });
});
