import { type ObjektKeyParts, objektKey } from "@/lib/discord/match";
import { messageKey } from "@/lib/discord/transcript";
import { EXTENSION_SOURCE, PAGE_SOURCE } from "@/lib/match/extension-handoff";
import { lookupArtwork, readArtworkCache } from "./artwork";
import { extensionApi } from "./browser";
import { automationAllowed, captureAllowed } from "./consent";
import { messageLink } from "./dom";
import { exportTranscript } from "./export";
import { DISCORD_MATCHES, pickTab, resolveTab } from "./host-tab";
import { loadInventory } from "./inventory";
import {
  deliverToMatch,
  MATCH_LABEL,
  MATCH_ORIGIN_IS_LOCAL,
  MATCH_PERMISSION,
  type MatchTabsApi,
  OBJEKT_ORIGIN,
  openMatchTab,
} from "./match-tab";
import { capturing, channelIds, isDiscordUrl } from "./settings";
import {
  type Captured,
  capture,
  clear,
  count,
  type Entry,
  entries,
} from "./store";

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
      const current = await extensionApi.windows.get(panelWindow);
      // Already the front window and not minimised: nothing to do. Anything
      // else — minimised, behind another window, or just not focused —
      // is fixed below rather than patched in place: asking the OS to
      // hand focus to an existing window from the background is the part
      // that is unreliable (window managers apply their own focus-stealing
      // prevention to it), not window creation, so replacing it with a
      // fresh window is the more reliable fix than updating this one.
      if (current.focused && current.state !== "minimized") return;
      await extensionApi.windows.remove(panelWindow);
    } catch {
      /* Already closed. */
    }
  }
  const created = await extensionApi.windows.create({
    url: `${extensionApi.runtime.getURL("panel.html")}?window=1`,
    type: "popup",
    width: 820,
    height: 760,
    state: "normal",
    focused: true,
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

/**
 * Keep open Discord tabs working across an install or an update.
 *
 * Declared content scripts only run at page load, so an update leaves every
 * open tab running the previous version — which is orphaned, cannot save
 * anything, and until now had to be reloaded by hand. Injecting the new copy
 * is enough: it announces itself and the old one stands down.
 *
 * On a first install there is nothing to replace, so the panel is opened
 * instead — otherwise the extension is installed, does nothing, and gives no
 * hint that a toolbar button is what starts it.
 */
extensionApi.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install" && details.reason !== "update") return;
  void (async () => {
    const tabs = await extensionApi.tabs.query({ url: DISCORD_MATCHES });
    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      await extensionApi.scripting
        .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
        .catch(() => {});
    }
    if (details.reason !== "install") return;
    const first = pickTab(tabs);
    if (typeof first?.id === "number")
      await extensionApi.tabs
        .sendMessage(first.id, { type: "open-panel" })
        .catch(() => {});
  })().catch(() => {});
});

/**
 * Whether objekt.my is reachable from the extension.
 *
 * It is a required host permission, but Firefox lets people switch host
 * permissions off after install, and a fetch refused for that reason reads as
 * a network error. Checking first turns it into something they can act on.
 */
async function objektAllowed(origin = OBJEKT_ORIGIN): Promise<boolean> {
  return extensionApi.permissions
    .contains({ origins: [origin] })
    .catch(() => false);
}
const OBJEKT_BLOCKED =
  "objekt.my access is switched off for this extension. Allow it from the browser's Extensions menu, then try again.";

const matchTabs: MatchTabsApi = {
  query: (filter) => extensionApi.tabs.query(filter),
  create: (options) => extensionApi.tabs.create(options),
  update: (id, options) => extensionApi.tabs.update(id, options),
  get: (id) => extensionApi.tabs.get(id),
  // Firefox for Android has no windows API; the tab is still activated.
  focusWindow: async (id) =>
    extensionApi.windows?.update(id, { focused: true }),
  onComplete: (id, done) => {
    const listener = (tabId: number, info: { status?: string }) => {
      if (tabId === id && info.status === "complete") done();
    };
    extensionApi.tabs.onUpdated.addListener(listener);
    return () => extensionApi.tabs.onUpdated.removeListener(listener);
  },
};

/**
 * Which server each channel belongs to, as learned from captures.
 *
 * A message link needs the server id, and posts captured before links were
 * kept have only their channel and message id. Any later capture in the same
 * channel supplies the server, so those older posts can be linked too.
 */
let channelGuilds: Promise<Record<string, string>> | null = null;
function knownGuilds(): Promise<Record<string, string>> {
  channelGuilds ??= extensionApi.storage.local
    .get("channelGuilds")
    .then((stored) =>
      stored.channelGuilds && typeof stored.channelGuilds === "object"
        ? (stored.channelGuilds as Record<string, string>)
        : {},
    )
    .catch(() => ({}));
  return channelGuilds;
}
async function rememberGuild(channel: string, guild: string) {
  const guilds = await knownGuilds();
  if (guilds[channel] === guild) return;
  guilds[channel] = guild;
  await extensionApi.storage.local.set({ channelGuilds: guilds });
}

/** The post's link, or one built from its `<channel>-<message>` key. */
function linkFor(post: Entry, guilds: Record<string, string>): string | null {
  if (post.link) return post.link;
  const ids = post.key.match(/^(\d+)-(\d+)$/);
  return ids ? messageLink(guilds[ids[1]], ids[1], ids[2]) : null;
}

/**
 * Put the last search's posts into objekt.my/match.
 *
 * Scoped to the last search, exactly as the file export was: the index is
 * cumulative, and matching against everything ever browsed pulls in stale
 * posts nobody asked about. Before any search, the whole index goes.
 */
async function openInMatch(): Promise<{ posts: number; sent: number }> {
  if (!(await objektAllowed(MATCH_PERMISSION)))
    throw new Error(
      `${MATCH_LABEL} access is switched off for this extension. Allow it from the browser's Extensions menu, then try again.`,
    );
  const stored = await extensionApi.storage.local.get([
    "searchRunId",
    "nickname",
    "wants",
  ]);
  const run =
    typeof stored.searchRunId === "string" && stored.searchRunId
      ? stored.searchRunId
      : null;
  const posts = (await entries()).filter((post) => !run || post.run === run);
  if (!posts.length)
    throw new Error("Nothing to open yet — run a search first.");
  const transcript = exportTranscript(posts.map((post) => post.block));
  // Keyed the way /match keys a post, so each can link back to its message.
  const links: Record<string, string> = {};
  const guilds = await knownGuilds();
  for (const post of posts) {
    const link = linkFor(post, guilds);
    if (link) links[messageKey(post.block.author, post.block.body)] = link;
  }
  const tabId = await openMatchTab(matchTabs);
  // A dev server that is not running still "loads" — as the browser's error
  // page, which refuses the script with something like "Frame with ID 0 is
  // showing error page". Say what that means instead.
  const unreachable = MATCH_ORIGIN_IS_LOCAL
    ? `Could not reach ${MATCH_LABEL} — is the dev server running (npm run dev)?`
    : `${MATCH_LABEL} could not be reached.`;
  const [injection] = await extensionApi.scripting
    .executeScript({
      target: { tabId },
      func: deliverToMatch,
      args: [
        {
          id: `${run ?? "index"}-${Date.now().toString(36)}`,
          transcript,
          nickname: typeof stored.nickname === "string" ? stored.nickname : "",
          wants: typeof stored.wants === "string" ? stored.wants : "",
          links,
        },
        PAGE_SOURCE,
        EXTENSION_SOURCE,
        30_000,
      ],
    })
    .catch(() => {
      throw new Error(unreachable);
    });
  const result = injection?.result;
  if (!result) throw new Error(unreachable);
  if (!result.ok) throw new Error(result.error);
  return { posts: result.posts, sent: posts.length };
}

/**
 * Card art for the panel's want tiles.
 *
 * Lookups are serialised so two quick edits of the want list cannot race each
 * other's cache writes and lose half of both.
 */
let artworkQueue: Promise<unknown> = Promise.resolve();
function artwork(items: unknown): Promise<Record<string, string | null>> {
  const parts: ObjektKeyParts[] = Array.isArray(items)
    ? items.filter(
        (item): item is ObjektKeyParts =>
          item &&
          typeof item === "object" &&
          typeof item.member === "string" &&
          typeof item.season === "string" &&
          typeof item.collectionNo === "string",
      )
    : [];
  const job = artworkQueue.then(async () => {
    if (!parts.length || !(await objektAllowed())) return {};
    const { artwork: stored } = await extensionApi.storage.local.get("artwork");
    const { urls, cache } = await lookupArtwork(
      parts,
      readArtworkCache(stored),
    );
    await extensionApi.storage.local.set({ artwork: cache });
    return urls;
  });
  artworkQueue = job.catch(() => {});
  return job;
}

/**
 * What the last search found, per wanted objekt.
 *
 * A post counts towards a card when it *has* that card — a post that merely
 * wants it is competition, not a lead. One read of the index answers every
 * card at once, which matters because the panel asks while a run is landing
 * posts.
 */
async function runSummary(run: unknown, keys: unknown) {
  const wanted = new Set(
    Array.isArray(keys)
      ? keys.filter((key): key is string => typeof key === "string")
      : [],
  );
  const all = await entries();
  const hits: Record<string, number> = {};
  let fromRun = 0;
  /** Newest post time, in the index and in this run: what the results are "as of". */
  let newest = 0;
  let newestRun = 0;
  for (const post of all) {
    const time = post.block.time ? Date.parse(post.block.time) : Number.NaN;
    if (Number.isFinite(time)) newest = Math.max(newest, time);
    if (typeof run !== "string" || post.run !== run) continue;
    fromRun++;
    if (Number.isFinite(time)) newestRun = Math.max(newestRun, time);
    const counted = new Set<string>();
    for (const item of post.parsed.haves) {
      const key = objektKey(item);
      if (!key || !wanted.has(key) || counted.has(key)) continue;
      counted.add(key);
      hits[key] = (hits[key] ?? 0) + 1;
    }
  }
  return {
    total: all.length,
    run: fromRun,
    hits,
    newest: newest || null,
    newestRun: newestRun || null,
  };
}

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
let settings: { consent: unknown; paused: string[] } | null = null;
async function currentSettings() {
  if (!settings) {
    const stored = await extensionApi.storage.local.get([
      "consent",
      "pausedChannels",
    ]);
    settings = {
      consent: stored.consent,
      paused: channelIds(stored.pausedChannels),
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
  if (changes.consent || changes.pausedChannels) settings = null;
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
      // Browsing a channel is captured unless it is paused — and only in a
      // server. A post with no numeric guild came from a DM, which the content
      // script already refuses; a stale or modified one would not, and this is
      // the last place a private conversation can be kept out of the index.
      const guild =
        typeof request.guild === "string" && /^\d+$/.test(request.guild)
          ? request.guild
          : null;
      if (!fromSearch && (!guild || !capturing(channel, current.paused)))
        throw new Error("Capture is paused");
      if (guild && channel) void rememberGuild(channel, guild).catch(() => {});
      let entry: Captured;
      try {
        entry = await capture(
          request.block,
          channel ? `${channel}-${messageId}` : messageId,
          searchRun,
          messageLink(guild, channel, messageId) ?? undefined,
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
    // Firefox gives an extension page framed by a web page no `tabs` API at
    // all, so the embedded panel cannot look up the tab it is sitting in or
    // talk to it. Both are answered here, where the API exists. Neither reaches
    // past what the panel could already do for itself in a window.
    if (request?.type === "host-tab") {
      const pinned = Number(request.tab);
      return await resolveTab(
        {
          get: (id) => extensionApi.tabs.get(id),
          query: () => extensionApi.tabs.query({ url: DISCORD_MATCHES }),
        },
        Number.isFinite(pinned) ? pinned : null,
      );
    }
    if (request?.type === "to-tab") {
      const tabId = Number(request.tabId);
      if (!Number.isFinite(tabId)) throw new Error("No tab to talk to");
      return await extensionApi.tabs.sendMessage(tabId, request.message);
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
    if (request?.type === "open-match") return await openInMatch();
    if (request?.type === "artwork") return await artwork(request.items);
    if (request?.type === "run-summary")
      return await runSummary(request.run, request.keys);
    if (request?.type === "inventory") {
      if (!(await objektAllowed())) throw new Error(OBJEKT_BLOCKED);
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
      // touching the channel settings here would change what gets collected
      // next, and the button name gives no hint that it would.
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
