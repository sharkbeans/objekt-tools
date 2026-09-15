import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  EXTENSION_SOURCE,
  PAGE_SOURCE,
  readExtensionMessage,
} from "@/lib/match/extension-handoff";
import {
  deliverToMatch,
  MATCH_URL,
  type MatchTabsApi,
  openMatchTab,
} from "./match-tab";

/**
 * A window whose postMessage behaves like a browser's: asynchronous, and
 * stamped with this window as the source and its own origin.
 */
function fakeWindow() {
  const target = new EventTarget() as EventTarget & Record<string, unknown>;
  target.location = { origin: "https://objekt.my" };
  target.postMessage = (data: unknown) => {
    setTimeout(() => {
      // Node's MessageEvent only accepts a MessagePort as the source, so the
      // browser's shape is put together by hand.
      const event = Object.assign(new Event("message"), {
        data,
        origin: "https://objekt.my",
        source: target,
      });
      target.dispatchEvent(event);
    }, 1);
  };
  return target;
}

let previous: unknown;
beforeEach(() => {
  previous = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = fakeWindow();
});
afterEach(() => {
  (globalThis as Record<string, unknown>).window = previous;
});

/** The /match side of the protocol, as `match-client.tsx` implements it. */
function servePage(options: { readyAfterMs: number; posts?: number }) {
  const win = window;
  const applied: string[] = [];
  setTimeout(() => {
    const handled = new Map<string, number>();
    win.addEventListener("message", (event) => {
      if (event.source !== win) return;
      const message = readExtensionMessage(event.data);
      if (!message) return;
      if (message.type === "hello") {
        win.postMessage({ source: PAGE_SOURCE, type: "ready" }, "*");
        return;
      }
      let posts = handled.get(message.id);
      if (posts === undefined) {
        posts = options.posts ?? 1;
        handled.set(message.id, posts);
        applied.push(message.transcript);
      }
      win.postMessage(
        { source: PAGE_SOURCE, type: "received", id: message.id, posts },
        "*",
      );
    });
    win.postMessage({ source: PAGE_SOURCE, type: "ready" }, "*");
  }, options.readyAfterMs);
  return applied;
}

const payload = {
  id: "run-1",
  transcript: "trader — 2026-09-09T03:41:00.000Z\nHAVE\nSeoYeon CC101",
  nickname: "",
  wants: "SeoYeon CC101",
  links: {},
};

test("delivers once to a page that was already listening", async () => {
  const applied = servePage({ readyAfterMs: 0, posts: 7 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const result = await deliverToMatch(
    payload,
    PAGE_SOURCE,
    EXTENSION_SOURCE,
    2000,
  );
  assert.deepEqual(result, { ok: true, posts: 7 });
  assert.equal(applied.length, 1, "several readys still apply the posts once");
});

test("waits out a page that has not hydrated yet", async () => {
  const applied = servePage({ readyAfterMs: 700 });
  const result = await deliverToMatch(
    payload,
    PAGE_SOURCE,
    EXTENSION_SOURCE,
    3000,
  );
  assert.deepEqual(result, { ok: true, posts: 1 });
  assert.equal(applied.length, 1);
});

test("gives up readably on a page that never answers", async () => {
  const result = await deliverToMatch(
    payload,
    PAGE_SOURCE,
    EXTENSION_SOURCE,
    50,
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /never answered/);
});

function tabsApi(
  open: { id: number; windowId?: number; status: string; url?: string }[],
) {
  const calls: string[] = [];
  let complete: (() => void) | null = null;
  const api: MatchTabsApi = {
    query: async () => open,
    create: async ({ url }) => {
      calls.push(`create ${url}`);
      setTimeout(() => complete?.(), 5);
      return { id: 99, status: "loading" };
    },
    update: async (id) => {
      calls.push(`update ${id}`);
    },
    get: async (id) => ({
      status: open.find((tab) => tab.id === id)?.status ?? "loading",
    }),
    focusWindow: async (id) => {
      calls.push(`focus ${id}`);
    },
    onComplete: (_id, done) => {
      complete = done;
      return () => {
        complete = null;
      };
    },
  };
  return { api, calls };
}

test("reuses the open /match tab rather than starting a second desk", async () => {
  const { api, calls } = tabsApi([{ id: 4, windowId: 2, status: "complete" }]);
  assert.equal(await openMatchTab(api), 4);
  assert.deepEqual(calls, ["update 4", "focus 2"]);
});

test("a /match tab on another localhost port is not the desk", async () => {
  // The query patterns cannot carry a port, so they match every localhost.
  const { api, calls } = tabsApi([
    { id: 5, url: "http://localhost:3001/match", status: "complete" },
  ]);
  assert.equal(await openMatchTab(api), 99);
  assert.deepEqual(calls, [`create ${MATCH_URL}`]);
});

test("opens /match when none is open, and waits for it to load", async () => {
  const { api, calls } = tabsApi([]);
  assert.equal(await openMatchTab(api), 99);
  assert.deepEqual(calls, [`create ${MATCH_URL}`]);
});
