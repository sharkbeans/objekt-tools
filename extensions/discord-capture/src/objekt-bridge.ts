/**
 * Content script on objekt.my pages. The whole of it is `startBridge` in
 * `bridge.ts`: answer "is the extension installed", store a hunt the user sent
 * by pressing a button as the want list, and bring Discord forward when they
 * ask for a new scan. It reads nothing else from the page and makes no network
 * requests.
 */

import { startBridge } from "./bridge";
import { extensionApi } from "./browser";

declare global {
  // Set in this script's isolated world, which the page cannot see.
  var __objektBridgeAlive: (() => boolean) | undefined;
}

function alive(): boolean {
  try {
    return Boolean(extensionApi.runtime?.id);
  } catch {
    return false;
  }
}

function showDiscord() {
  void extensionApi.runtime
    .sendMessage({ type: "show-discord" })
    .catch(() => {});
}

// The worker injects this into objekt.my tabs that were open before an
// install or update, and Firefox also runs declared content scripts in them —
// so a tab can be handed a second copy. One live copy is enough; a copy left
// over from a previous version of the extension no longer counts as live.
if (!globalThis.__objektBridgeAlive?.()) {
  globalThis.__objektBridgeAlive = alive;
  startBridge({
    win: window,
    storage: {
      get: (keys) => extensionApi.storage.local.get(keys),
      set: (items) => extensionApi.storage.local.set(items),
      remove: (keys) => extensionApi.storage.local.remove(keys),
    },
    version: extensionApi.runtime.getManifest().version,
    alive,
    // The user just pressed "Find on Discord": take them there.
    onSaved: showDiscord,
    // Likewise "Run a new scan" with no want list to send.
    onOpenPanel: showDiscord,
  });
}
