/**
 * Handing a search to objekt.my/match without a file in between.
 *
 * The page side of this, and why it needs a handshake at all, is in
 * `@/lib/match/extension-handoff`. This is the extension side: find or open
 * the /match tab, wait for it to load, and run `deliverToMatch` inside it.
 */

import { APP_ORIGIN } from "./app-origin";

export const MATCH_URL = `${APP_ORIGIN}/match`;
/**
 * Every /match tab. Match patterns ignore the fragment, so a hash needs no
 * pattern of its own; a query string does.
 */
export const MATCH_TABS = [MATCH_URL, `${MATCH_URL}?*`];
/** The host permission everything on the app's origin goes through. */
export const OBJEKT_ORIGIN = `${APP_ORIGIN}/*`;

export type Delivery =
  | { ok: true; posts: number }
  | { ok: false; error: string };

/**
 * Deliver a transcript to a /match page. Runs inside the page's tab.
 *
 * `scripting.executeScript` serialises this function's source, so it cannot
 * reach anything outside itself: no imports, no module constants, no helpers.
 * The message sources come in as arguments for that reason, and the shapes it
 * posts are the ones `readExtensionMessage` accepts.
 *
 * It says hello on a timer rather than once, because it may run before the
 * page has hydrated — and a page that is not listening yet cannot answer.
 */
export function deliverToMatch(
  payload: { id: string; transcript: string; nickname: string; wants: string },
  pageSource: string,
  extensionSource: string,
  timeoutMs: number,
): Promise<Delivery> {
  return new Promise((resolve) => {
    let sent = false;
    let hello: ReturnType<typeof setInterval> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: Delivery) => {
      clearInterval(hello);
      clearTimeout(expiry);
      window.removeEventListener("message", onMessage);
      resolve(result);
    };
    const post = (message: Record<string, unknown>) =>
      window.postMessage(
        { source: extensionSource, ...message },
        window.location.origin,
      );
    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object" || data.source !== pageSource)
        return;
      if (data.type === "ready") {
        // Every ready gets the delivery: the page acknowledges by id, so a
        // second copy is answered rather than applied.
        sent = true;
        clearInterval(hello);
        post({ type: "import", ...payload });
        return;
      }
      if (
        data.type === "received" &&
        data.id === payload.id &&
        typeof data.posts === "number"
      )
        finish({ ok: true, posts: data.posts });
    }
    window.addEventListener("message", onMessage);
    post({ type: "hello" });
    hello = setInterval(() => post({ type: "hello" }), 500);
    expiry = setTimeout(
      () =>
        finish({
          ok: false,
          error: sent
            ? "objekt.my/match took the posts but never confirmed them. Check the tab."
            : "objekt.my/match never answered. Reload that tab and try again — if it keeps happening, the site may be on an older version.",
        }),
      timeoutMs,
    );
  });
}

/** The little of `tabs` this needs, so tests can hand over plain objects. */
export interface MatchTabsApi {
  query: (filter: {
    url: string[];
  }) => Promise<
    { id?: number; windowId?: number; status?: string; lastAccessed?: number }[]
  >;
  create: (options: {
    url: string;
    active: boolean;
  }) => Promise<{ id?: number; status?: string }>;
  update: (id: number, options: { active: boolean }) => Promise<unknown>;
  get: (id: number) => Promise<{ status?: string }>;
  focusWindow: (id: number) => Promise<unknown>;
  onComplete: (id: number, done: () => void) => () => void;
}

/**
 * The /match tab to deliver into: the most recently used open one, brought to
 * the front, or a new one. Resolves once it has finished loading.
 *
 * Reusing a tab matters more than it looks: /match keeps its posts in the
 * browser, so a second tab would be a second copy of the desk, and a delivery
 * into it would not show up in the one the user is actually working in.
 */
export async function openMatchTab(
  tabs: MatchTabsApi,
  timeoutMs = 30_000,
): Promise<number> {
  const open = (await tabs.query({ url: MATCH_TABS }))
    .filter((tab) => typeof tab.id === "number")
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  let id: number;
  if (open && typeof open.id === "number") {
    id = open.id;
    await tabs.update(id, { active: true });
    if (typeof open.windowId === "number")
      await tabs.focusWindow(open.windowId).catch(() => {});
  } else {
    const created = await tabs.create({ url: MATCH_URL, active: true });
    if (typeof created.id !== "number")
      throw new Error("Could not open objekt.my/match.");
    id = created.id;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error("objekt.my/match took too long to load."));
    }, timeoutMs);
    const stop = tabs.onComplete(id, () => {
      clearTimeout(timer);
      stop();
      resolve();
    });
    // Checked after subscribing, so a load finishing in between is not missed.
    void tabs.get(id).then(
      (tab) => {
        if (tab.status === "complete") {
          clearTimeout(timer);
          stop();
          resolve();
        }
      },
      () => {
        clearTimeout(timer);
        stop();
        reject(new Error("The objekt.my/match tab was closed."));
      },
    );
  });
  return id;
}
