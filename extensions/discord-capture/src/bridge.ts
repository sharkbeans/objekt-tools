/**
 * The extension's side of objekt.my pages: say it is installed, and take a
 * hunt as the want list. `objekt-bridge.ts` runs this as a content script on
 * objekt.my; it is kept apart from that entry point so tests can drive it with
 * a fake window and fake storage.
 *
 * Deliberately narrow, because it runs on a site where the user is signed in:
 *
 * - It reads nothing from the page — no DOM, no cookies, no storage — only
 *   `window.postMessage` data that `readPageMessage` accepts, and only from
 *   this window on its own origin.
 * - It answers `ping` with `present`, and stores a `hunt` locally and answers
 *   `hunt-saved`. Nothing else is listened for, and it makes no requests.
 *   Once a hunt is stored it asks the extension's own worker to bring the
 *   user's Discord tab forward — the one message it sends inside the
 *   extension.
 */

import {
  EXTENSION_SOURCE,
  type ExtensionMessage,
  readPageMessage,
} from "@/lib/match/extension-handoff";
import { HUNT_READ_KEYS, huntCount, huntWrite } from "./hunt";

/** The little of `storage.local` a hunt needs. */
export interface BridgeStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** The little of `window` the bridge touches. */
export interface BridgeWindow {
  location: { origin: string };
  postMessage(message: unknown, targetOrigin: string): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
}

export interface BridgeOptions {
  win: BridgeWindow;
  storage: BridgeStorage;
  version: string;
  /**
   * False once the extension has been reloaded or removed under this script.
   * An orphaned copy answers nothing: claiming to be installed and then
   * failing to store a hunt is worse than saying nothing.
   */
  alive: () => boolean;
  /**
   * Called once a hunt is stored, before the page hears about it. The entry
   * point uses it to bring Discord forward.
   */
  onSaved?: () => void;
  now?: () => number;
}

/** Start listening. Returns a function that stops it. */
export function startBridge({
  win,
  storage,
  version,
  alive,
  onSaved,
  now = Date.now,
}: BridgeOptions): () => void {
  const post = (message: ExtensionMessage) =>
    win.postMessage(message, win.location.origin);
  const present = () =>
    post({ source: EXTENSION_SOURCE, type: "present", version });

  async function save(hunt: { id: string; wants: string; nickname: string }) {
    const stored = await storage.get([...HUNT_READ_KEYS]);
    const write = huntWrite(stored, hunt, now());
    if (write.remove.length) await storage.remove(write.remove);
    if (Object.keys(write.set).length) await storage.set(write.set);
  }

  function onMessage(event: MessageEvent) {
    // Only this window: a frame, an opener or another origin cannot pass both.
    if (
      event.source !== (win as unknown) ||
      event.origin !== win.location.origin
    )
      return;
    const message = readPageMessage(event.data);
    if (!message || !alive()) return;
    if (message.type === "ping") {
      present();
      return;
    }
    if (message.type !== "hunt") return;
    const { id, wants } = message;
    save(message).then(
      () => {
        onSaved?.();
        post({
          source: EXTENSION_SOURCE,
          type: "hunt-saved",
          id,
          count: huntCount(wants),
        });
      },
      // No reply is the failure signal: the page times out and falls back to
      // opening /match, which works without the extension.
      () => {},
    );
  }

  win.addEventListener("message", onMessage);
  if (alive()) present();
  return () => win.removeEventListener("message", onMessage);
}
