import { extensionApi } from "./browser";
import { automationAllowed, captureAllowed } from "./consent";
import { loadInventory } from "./inventory";
import { channelIds, isDiscordUrl } from "./settings";
import { capture, clear, count, type Entry, entries } from "./store";

/**
 * The panel UI, wherever it is being shown from.
 *
 * The embedded panel carries its tab in the query string, so this compares the
 * document rather than the whole URL — matching on the exact string is what
 * would let an embedded panel through as "not the panel" and refuse every
 * privileged request it makes.
 */
function fromPanel(url: string | undefined): boolean {
  if (!url) return false;
  const panel = extensionApi.runtime.getURL("panel.html");
  return url === panel || url.startsWith(`${panel}?`);
}

/**
 * Make sure the tab has a content script before talking to it.
 *
 * Declared content scripts are injected at page load, so a Discord tab that was
 * already open when the extension was installed or updated has nothing
 * listening. That was previously answered with "reload the Discord tab (F5)",
 * which is a fine explanation and a poor experience.
 */
async function ensureContentScript(tabId: number): Promise<void> {
  try {
    const alive = await extensionApi.tabs.sendMessage(tabId, { type: "ping" });
    if (alive?.ok) return;
  } catch {
    /* Nothing listening yet, which is what the injection below is for. */
  }
  await extensionApi.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

/**
 * The pop-out window: the panel as a real browser window, for people who would
 * rather have it beside Discord than on top of it.
 *
 * The id is kept in storage rather than in a variable because the service
 * worker is torn down between clicks, and a forgotten id opens a second window
 * on top of the first.
 */
async function openPanelWindow(): Promise<void> {
  const { panelWindow } = await extensionApi.storage.local.get("panelWindow");
  if (typeof panelWindow === "number") {
    try {
      await extensionApi.windows.update(panelWindow, {
        focused: true,
        drawAttention: true,
      });
      return;
    } catch {
      /* Closed since it was recorded. */
    }
  }
  const created = await extensionApi.windows.create({
    url: `${extensionApi.runtime.getURL("panel.html")}?window=1`,
    type: "popup",
    width: 420,
    height: 780,
  });
  await extensionApi.storage.local.set({ panelWindow: created?.id ?? null });
}

extensionApi.windows?.onRemoved.addListener((closed) => {
  void extensionApi.storage.local.get("panelWindow").then((settings) => {
    if (settings.panelWindow === closed)
      void extensionApi.storage.local.remove("panelWindow");
  });
});

/**
 * The toolbar button shows the panel in the page, or the window when there is
 * no page to show it in.
 *
 * There is no `default_popup` any more: a popup that closes whenever the user
 * looks at Discord is the wrong container for something that runs for minutes.
 */
extensionApi.action.onClicked.addListener((tab) => {
  void (async () => {
    if (typeof tab?.id === "number" && isDiscordUrl(tab.url)) {
      await ensureContentScript(tab.id);
      await extensionApi.tabs.sendMessage(tab.id, { type: "toggle-panel" });
      return;
    }
    await openPanelWindow();
  })().catch(() => openPanelWindow());
});

function isBlock(
  value: unknown,
): value is { author: string; body: string; time: string } {
  if (!value || typeof value !== "object") return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.author === "string" &&
    b.author.length > 0 &&
    b.author.length < 300 &&
    typeof b.body === "string" &&
    b.body.length > 0 &&
    b.body.length < 100_000 &&
    typeof b.time === "string" &&
    Number.isFinite(Date.parse(b.time))
  );
}
/**
 * Settings the capture path reads for every post, cached for the worker's life.
 *
 * Two storage reads per captured post is nothing when posts arrive as fast as
 * somebody scrolls. A search run delivers a page of twenty-five at once, and
 * they were paying for a consent read and a channel read each. The cache is
 * dropped whenever either changes, and dies with the worker — which is the
 * right lifetime, because a worker that has been torn down re-reads anyway.
 */
let settings: { consent: unknown; channels: string[] } | null = null;
async function currentSettings() {
  if (!settings) {
    const stored = await extensionApi.storage.local.get([
      "consent",
      "channels",
    ]);
    settings = {
      consent: stored.consent,
      channels: channelIds(stored.channels),
    };
  }
  return settings;
}

/**
 * Publish the index size to the toolbar badge and to storage.
 *
 * The badge is for the user; the storage copy is how an open panel learns that
 * a post landed — a panel has no way to observe IndexedDB on the worker's
 * origin. Both are coalesced: during a run the number changes twenty-five
 * times a page, and nobody can read a badge that fast.
 */
const PUBLISH_MS = 700;
let publishQueued = false;
let publishedAt = 0;
async function publishCount(): Promise<void> {
  publishedAt = Date.now();
  const total = await count();
  await extensionApi.action.setBadgeText({ text: String(total) });
  await extensionApi.storage.local.set({ captured: total });
}
function schedulePublish(): void {
  if (publishQueued) return;
  publishQueued = true;
  setTimeout(
    () => {
      publishQueued = false;
      void publishCount().catch(() => {});
    },
    Math.max(0, PUBLISH_MS - (Date.now() - publishedAt)),
  );
}

/**
 * Ask the browser not to evict the index.
 *
 * Without this the store is "best effort" storage, which the browser is free
 * to clear when the disk gets tight — quietly, and taking a week of captures
 * with it. Asked for once capture has been agreed to, because that is when
 * there is something worth keeping and when asking is least surprising.
 */
async function requestPersistence(): Promise<void> {
  try {
    const storage = navigator.storage;
    if (!storage?.persist || (await storage.persisted())) return;
    await storage.persist();
  } catch {
    /* Not supported, or refused. The index still works, it is just evictable. */
  }
}

/** What the panel shows under Troubleshooting: how much room the index has. */
async function storageReport() {
  try {
    const estimate = (await navigator.storage?.estimate?.()) ?? {};
    return {
      persisted: (await navigator.storage?.persisted?.()) ?? false,
      usage: estimate.usage ?? null,
      quota: estimate.quota ?? null,
    };
  } catch {
    return { persisted: false, usage: null, quota: null };
  }
}

/**
 * An unthrottled timer for the content script.
 *
 * Chrome throttles `setTimeout` in a hidden tab — to a second after ten
 * seconds of hiding, and to once a minute once it decides the page is idle.
 * A search run paces itself on 150ms polls, so in a background tab it does not
 * slow down so much as stop. The worker is not a tab and is not throttled, so
 * it keeps time on the run's behalf. The caller races this against its own
 * timer, so a worker that has been torn down costs latency, never a hang.
 */
function wake(ms: number): Promise<true> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(true), Math.min(60_000, Math.max(0, ms))),
  );
}

/**
 * A run holds this port open for as long as it lasts.
 *
 * An MV3 worker is torn down after thirty seconds without work. Mid-run that
 * takes the timer service and the open database with it, and the run stalls
 * until its next message wakes a fresh worker. A connected port with traffic
 * on it is the documented way to say "still working".
 */
extensionApi.runtime.onConnect.addListener((port) => {
  if (port.name !== "objekt-run") return;
  port.onMessage.addListener(() => {
    try {
      port.postMessage({ alive: true });
    } catch {
      /* Disconnected between the message and the reply. */
    }
  });
});

extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.consent || changes.channels) settings = null;
  if (changes.captureError)
    reportedError = typeof changes.captureError.newValue === "string";
  if (changes.consent && captureAllowed(changes.consent.newValue))
    void requestPersistence();
});
/**
 * Whether a storage failure is currently being reported to the user.
 *
 * Read back at start-up rather than assumed: the worker is torn down
 * constantly, and a flag that resets to false on every restart would leave the
 * error banner up for good — the clear only runs when this says there is
 * something to clear.
 */
let reportedError = false;
void extensionApi.storage.local
  .get("captureError")
  .then((stored) => {
    reportedError = typeof stored.captureError === "string";
  })
  .catch(() => {});

extensionApi.runtime.onMessage.addListener((request, sender, reply) => {
  if (sender.id !== extensionApi.runtime.id) return;
  const panel = fromPanel(sender.url);
  // The sender URL proves the message came from a Discord page; which channel
  // the post belongs to comes from the message, because search results render
  // posts from channels other than the one currently open.
  const fromDiscord = isDiscordUrl(sender.url);
  const channel =
    typeof request?.channel === "string" && /^\d+$/.test(request.channel)
      ? request.channel
      : null;
  // A search result is kept wherever it was posted; only channel browsing is
  // gated on the enabled list. Results also reach here with no channel at all
  // when Discord does not link one, which is why the key falls back to the
  // message id — unique on its own, since it is a snowflake.
  const fromSearch = request?.source === "search";
  // Which search produced this post, so the export can be scoped to it.
  const searchRun =
    fromSearch && typeof request?.run === "string" && request.run
      ? request.run
      : undefined;
  const messageId =
    typeof request?.id === "string" && /^\d+$/.test(request.id)
      ? request.id
      : null;
  const run = async () => {
    if (
      request?.type === "capture" &&
      fromDiscord &&
      (channel || fromSearch) &&
      messageId &&
      isBlock(request.block)
    ) {
      // Defence in depth. The content script does not read a message body
      // before consent is recorded, so nothing should reach here without it —
      // but a stale content script from before an upgrade would not know that,
      // and this is the last point where a post can still be refused.
      const current = await currentSettings();
      if (!captureAllowed(current.consent))
        throw new Error("Capture has not been agreed to yet");
      if (fromSearch && !automationAllowed(current.consent))
        throw new Error("Search has not been agreed to yet");
      if (!fromSearch && (!channel || !current.channels.includes(channel)))
        throw new Error("Capture is paused");
      let entry: Entry;
      try {
        entry = await capture(
          request.block,
          channel ? `${channel}-${messageId}` : messageId,
          searchRun,
        );
      } catch {
        reportedError = true;
        await extensionApi.action.setBadgeText({ text: "!" });
        await extensionApi.storage.local.set({
          captureError:
            "Could not save captured posts. Browser storage may be full. Export your index before clearing it.",
        });
        throw new Error("Could not save captured post");
      }
      // Only worth a write when there is actually an error to clear; this used
      // to run for every post captured.
      if (reportedError) {
        reportedError = false;
        await extensionApi.storage.local.remove("captureError");
      }
      schedulePublish();
      return entry;
    }
    // A content script may ask for two things: proof it is loaded, and which
    // tab it is in, so an embedded panel can act on its own tab.
    if (fromDiscord) {
      if (request?.type === "ping") return true;
      // Keeping time for a tab whose own timers are being throttled.
      if (request?.type === "wake") return wake(Number(request.ms));
      if (request?.type === "tab-id") return sender.tab?.id ?? null;
      if (request?.type === "open-window") {
        await openPanelWindow();
        // One live panel at a time: the embedded one closes as the window opens.
        if (typeof sender.tab?.id === "number")
          await extensionApi.tabs
            .sendMessage(sender.tab.id, { type: "close-panel" })
            .catch(() => {});
        return true;
      }
    }
    if (!panel) throw new Error("Unsupported request");
    if (request?.type === "open-window") {
      await openPanelWindow();
      return true;
    }
    if (request?.type === "ensure") {
      const tabId = Number(request.tabId);
      if (!Number.isFinite(tabId)) throw new Error("No tab to start in");
      await ensureContentScript(tabId);
      return true;
    }
    if (request?.type === "close-window") {
      // Only a panel that *is* a window may close one. The embedded panel is
      // also a panel document, and its window is the user's Discord window —
      // closing that on a stray message would be spectacular. A top-level
      // frame whose own URL is the panel is the one case that is safe.
      const id = sender.tab?.windowId;
      if (
        sender.frameId === 0 &&
        fromPanel(sender.tab?.url) &&
        id !== undefined
      )
        await extensionApi.windows.remove(id);
      return true;
    }
    if (request?.type === "show-panel") {
      const tabId = Number(request.tabId);
      if (!Number.isFinite(tabId)) throw new Error("No tab to show it in");
      await ensureContentScript(tabId);
      await extensionApi.tabs.sendMessage(tabId, { type: "open-panel" });
      return true;
    }
    if (request?.type === "inventory") {
      const owned = await loadInventory(request.nickname);
      await extensionApi.storage.local.set({
        owned,
        nickname: request.nickname,
      });
      return owned.length;
    }
    if (request?.type === "storage") return storageReport();
    if (request?.type === "dump") return entries();
    if (request?.type === "count")
      return count(typeof request.run === "string" ? request.run : undefined);
    if (request?.type === "clear") {
      // Clears posts only. Pausing capture is a separate, deliberate action —
      // wiping the enabled channels here silently stopped collection and the
      // button name gave no hint that it would.
      await clear();
      publishedAt = Date.now();
      await extensionApi.action.setBadgeText({ text: "" });
      await extensionApi.storage.local.set({ captured: 0 });
      return true;
    }
    throw new Error("Unsupported request");
  };
  void run().then(
    (value) => reply({ ok: true, value }),
    (error) =>
      reply({
        ok: false,
        error: error instanceof Error ? error.message : "Capture failed",
      }),
  );
  return true;
});
