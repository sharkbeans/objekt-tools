import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXTENSION_SOURCE, PAGE_SOURCE } from "@/lib/match/extension-handoff";
import { type BridgeWindow, startBridge } from "./bridge";

const ORIGIN = "https://objekt.my";

/** A window whose postMessage is async and stamped with itself and its origin. */
function fakeWindow() {
  const target = new EventTarget();
  const sent: unknown[] = [];
  const win: BridgeWindow & { sent: unknown[]; deliver: typeof deliver } = {
    location: { origin: ORIGIN },
    sent,
    postMessage: (message) => {
      sent.push(message);
    },
    addEventListener: (type, listener) =>
      target.addEventListener(type, listener as EventListener),
    removeEventListener: (type, listener) =>
      target.removeEventListener(type, listener as EventListener),
    deliver,
  };
  /** Dispatch as if the page (or someone else) posted `data`. */
  function deliver(
    data: unknown,
    from: { source?: unknown; origin?: string } = {},
  ) {
    target.dispatchEvent(
      Object.assign(new Event("message"), {
        data,
        origin: from.origin ?? ORIGIN,
        source: "source" in from ? from.source : win,
      }),
    );
  }
  return win;
}

function fakeStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: async (keys: string[]) =>
      Object.fromEntries(
        keys.filter((k) => k in data).map((k) => [k, data[k]]),
      ),
    set: async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    },
    remove: async (keys: string[]) => {
      for (const key of keys) delete data[key];
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

const hunt = {
  source: PAGE_SOURCE,
  type: "hunt",
  id: "hunt-abc",
  wants: "SeoYeon CC103\nSeoYeon CC104\nSeoYeon CC105",
  nickname: "sjarkbean",
};

describe("startBridge", () => {
  it("takes the user to Discord only once a hunt is stored", async () => {
    const win = fakeWindow();
    let shown = 0;
    startBridge({
      win,
      storage: fakeStorage(),
      version: "1.2.0",
      alive: () => true,
      onSaved: () => shown++,
    });
    win.deliver({ source: PAGE_SOURCE, type: "ping" });
    await settle();
    assert.equal(shown, 0, "a ping is not a reason to switch tabs");
    win.deliver(hunt);
    await settle();
    assert.equal(shown, 1);

    // Storage failing means nothing was stored: stay put.
    const failing = fakeWindow();
    let failedShown = 0;
    startBridge({
      win: failing,
      storage: {
        ...fakeStorage(),
        set: async () => {
          throw new Error("quota");
        },
      },
      version: "1.2.0",
      alive: () => true,
      onSaved: () => failedShown++,
    });
    failing.deliver(hunt);
    await settle();
    assert.equal(failedShown, 0);
  });

  it("announces itself on load and on every ping", () => {
    const win = fakeWindow();
    startBridge({
      win,
      storage: fakeStorage(),
      version: "1.2.0",
      alive: () => true,
    });
    const present = {
      source: EXTENSION_SOURCE,
      type: "present",
      version: "1.2.0",
    };
    assert.deepEqual(win.sent, [present]);
    win.deliver({ source: PAGE_SOURCE, type: "ping" });
    win.deliver({ source: PAGE_SOURCE, type: "ping" });
    assert.deepEqual(win.sent, [present, present, present]);
  });

  it("stores a hunt as the want list and confirms it", async () => {
    const win = fakeWindow();
    const storage = fakeStorage({ wants: "YooYeon AA101", nickname: "mine" });
    startBridge({
      win,
      storage,
      version: "1.2.0",
      alive: () => true,
      now: () => 42,
    });
    win.deliver(hunt);
    await settle();
    assert.equal(storage.data.wants, hunt.wants);
    assert.equal(storage.data.wantsBeforeHunt, "YooYeon AA101");
    assert.equal(storage.data.huntId, "hunt-abc");
    assert.equal(storage.data.huntAt, 42);
    assert.equal(storage.data.nickname, "mine", "the user's nickname is kept");
    assert.deepEqual(win.sent.at(-1), {
      source: EXTENSION_SOURCE,
      type: "hunt-saved",
      id: "hunt-abc",
      count: 3,
    });
  });

  it("ignores messages from other windows, origins and sources", async () => {
    const win = fakeWindow();
    const storage = fakeStorage();
    startBridge({ win, storage, version: "1.2.0", alive: () => true });
    win.deliver(hunt, { source: {} });
    win.deliver(hunt, { origin: "https://evil.example" });
    win.deliver(hunt, { source: null });
    win.deliver({ ...hunt, source: EXTENSION_SOURCE });
    win.deliver({ ...hunt, wants: "" });
    win.deliver({ source: PAGE_SOURCE, type: "ready" });
    await settle();
    assert.deepEqual(storage.data, {});
    assert.equal(win.sent.length, 1, "only the load-time present");
  });

  it("stays silent once the extension is gone from under it", async () => {
    const win = fakeWindow();
    const storage = fakeStorage();
    let live = true;
    startBridge({ win, storage, version: "1.2.0", alive: () => live });
    live = false;
    win.deliver({ source: PAGE_SOURCE, type: "ping" });
    win.deliver(hunt);
    await settle();
    assert.equal(win.sent.length, 1);
    assert.deepEqual(storage.data, {});
  });

  it("does not claim a hunt it failed to store", async () => {
    const win = fakeWindow();
    const storage = {
      ...fakeStorage(),
      set: async () => {
        throw new Error("quota");
      },
    };
    startBridge({ win, storage, version: "1.2.0", alive: () => true });
    win.deliver(hunt);
    await settle();
    assert.equal(
      win.sent.some((m) => (m as { type?: string }).type === "hunt-saved"),
      false,
    );
  });

  it("stops listening when stopped", () => {
    const win = fakeWindow();
    const stop = startBridge({
      win,
      storage: fakeStorage(),
      version: "1.2.0",
      alive: () => true,
    });
    stop();
    win.deliver({ source: PAGE_SOURCE, type: "ping" });
    assert.equal(win.sent.length, 1);
  });
});
