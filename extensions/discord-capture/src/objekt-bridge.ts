/**
 * Content script on objekt.my pages. The whole of it is `startBridge` in
 * `bridge.ts`: answer "is the extension installed", and store a hunt the user
 * sent by pressing a button as the want list. It reads nothing else from the
 * page and makes no network requests.
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
  });
}
