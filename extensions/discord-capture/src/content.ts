import {
  indexOwned,
  matchTranscript,
  objektKey,
  parseOffering,
} from "@/lib/discord/match";
import { extensionApi } from "./browser";
import { automationAllowed, captureAllowed } from "./consent";
import {
  MESSAGE_BODY,
  MESSAGE_SELECTOR,
  readMessage,
  resultBodies,
  rowKey,
  rowOf,
} from "./dom";
import { inventoryRows } from "./inventory";
import {
  closePanel,
  markPanelBusy,
  openPanel,
  togglePanel,
  watchPanelPlacement,
} from "./panel-frame";
import { readPanelState } from "./panel-geometry";
import {
  type CaptureProbe,
  currentPage,
  findNextPage,
  findSearchBox,
  resultRows,
  resultsPanel,
  runSearches,
  searchQueries,
} from "./search";
import {
  DEFAULT_COOLDOWN_MS,
  describePlan,
  planQueries,
  pruneSearchedAt,
  readSearchedAt,
} from "./search-plan";
import { channelFromUrl, channelIds } from "./settings";
import type { Entry } from "./store";
import { waitFor } from "./wait";

let owned = indexOwned([]);
// The viewer's typed wants, keyed the same way `matchTranscript` keys a
// poster's haves — lets the badge report a return leg, not just one direction.
let wantedKeys = new Set<string>();
let revision = 0;
function annotate(element: Element, entry: Entry) {
  element.querySelector(":scope > objekt-match-badge")?.remove();
  const match = matchTranscript([entry.parsed], owned, wantedKeys)[0];
  const wantCount = match?.theyWantYouHave.length ?? 0;
  const giveCount = match?.theyHaveYouWant.length ?? 0;
  if (!wantCount && !giveCount) return;
  const host = document.createElement("objekt-match-badge");
  const shadow = host.attachShadow({ mode: "closed" });
  const badge = document.createElement("span");
  badge.textContent = match?.isMutual
    ? `objekt.my · mutual — wants ${wantCount}, has ${giveCount} you want`
    : wantCount
      ? `objekt.my · wants ${wantCount} of yours`
      : `objekt.my · has ${giveCount} you want`;
  badge.style.cssText =
    "display:inline-block;margin:4px 0;padding:3px 8px;border-radius:8px;background:#312e81;color:#eef2ff;font:12px system-ui";
  shadow.append(badge);
  element.append(host);
}

let channels: string[] = [];
const enabled = (channel: string | null) =>
  channel !== null && channels.includes(channel);
// Search covers the whole server, so results arrive from channels the user
// never enabled. Counting them separates "the pager never moved" from "it
// moved and everything it found was filtered out".
const skipped = new Map<string, number>();
let seen = new WeakMap<Element, string>();
const pending = new WeakSet<Element>();

// What capture did with each rendered row, keyed by Discord's row id. A search
// page is only finished when every row on it lands in one of these — otherwise
// the run would page past posts it never recorded, which is exactly what a
// fixed delay used to do whenever Discord was a beat slower than usual.
/** Rows confirmed written to the index. */
const recorded = new Set<string>();
/** Rows from channels the user has not enabled. Never going to be recorded. */
const pausedRows = new Set<string>();
/**
 * Rows the parser cannot read, and when they were first seen that way.
 *
 * Attachment-only posts read as unreadable forever, so they cannot hold a page
 * open indefinitely; a row caught mid-hydration reads the same way for a frame
 * or two, so they cannot be written off instantly either. The grace window is
 * the compromise.
 */
const unreadableSince = new Map<string, number>();
const UNREADABLE_GRACE_MS = 1500;

async function scan(element: Element) {
  if (!watching || pending.has(element)) return;
  const message = readMessage(element);
  // The channel toggle governs passive browsing of a channel. A search result
  // is here because the user asked for it by name, so it is kept wherever in
  // the server it was posted — filtering those by the one channel that happens
  // to be open is how a search of the whole guild returned almost nothing.
  if (message && message.source === "channel" && !enabled(message.channel)) {
    const key = message.channel ?? "unknown";
    skipped.set(key, (skipped.get(key) ?? 0) + 1);
    pausedRows.add(rowKey(element));
    return;
  }
  if (!message) {
    const key = rowKey(element);
    if (!unreadableSince.has(key)) unreadableSince.set(key, Date.now());
    element.querySelector(":scope > objekt-match-badge")?.remove();
    return;
  }
  unreadableSince.delete(rowKey(element));
  const signature = JSON.stringify([message, revision]);
  if (seen.get(element) === signature) return;
  pending.add(element);
  try {
    const response = await extensionApi.runtime.sendMessage({
      type: "capture",
      channel: message.channel,
      source: message.source,
      run: searchRun,
      id: message.id,
      block: {
        author: message.author,
        body: message.body,
        time: message.time.raw,
      },
    });
    if (response?.ok) {
      recorded.add(rowKey(element));
      // Only results count towards the run. The open channel keeps taking posts
      // the whole time a search is running, and those are not what was searched
      // for.
      if (message.source === "search") countPost(rowKey(element));
      // A virtualized row may have been recycled while the worker was saving.
      const current = readMessage(element);
      if (
        element.isConnected &&
        current &&
        (current.source === "search" || enabled(current.channel)) &&
        JSON.stringify([current, revision]) === signature
      ) {
        seen.set(element, signature);
        annotate(element, response.value);
      }
    }
  } catch {
    /* Extension reload or unavailable worker: retry on the next render. */
  } finally {
    pending.delete(element);
    const current = readMessage(element);
    if (!current)
      element.querySelector(":scope > objekt-match-badge")?.remove();
    if (current && JSON.stringify([current, revision]) !== signature)
      void scan(element);
  }
}
function visit(node: Node) {
  if (!(node instanceof Element)) {
    if (node.parentElement) visit(node.parentElement);
    return;
  }
  const parent = node.closest(MESSAGE_SELECTOR);
  if (parent) void scan(parent);
  for (const element of node.querySelectorAll(MESSAGE_SELECTOR))
    void scan(element);
  // Search results carry no chat-messages wrapper, so the selector above walks
  // straight past them — which is why an entire index turned out to hold
  // nothing but the channel list.
  const body = node.closest(MESSAGE_BODY);
  if (body && !body.closest(MESSAGE_SELECTOR)) void scan(rowOf(body));
  for (const found of resultBodies(node)) void scan(rowOf(found));
}
const observer = new MutationObserver((records) => {
  for (const record of records) {
    const target =
      record.target instanceof Element
        ? record.target
        : record.target.parentElement;
    const message = target?.closest(MESSAGE_SELECTOR);
    if (message) void scan(message);
    for (const node of record.addedNodes) visit(node);
  }
});
/**
 * Nothing observes the page until the user has agreed to capture.
 *
 * The disclosure requirement is about handling, not only about storing: an
 * observer that reads message bodies and decides they are unreadable has still
 * read them. So the observer is attached on consent and detached when it is
 * withdrawn, rather than left running behind a flag.
 */
let watching = false;
function watch(on: boolean) {
  if (on === watching) return;
  watching = on;
  if (!on) {
    observer.disconnect();
    for (const badge of document.querySelectorAll("objekt-match-badge"))
      badge.remove();
    return;
  }
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["id", "datetime", "aria-labelledby"],
  });
}
let consent: unknown;
function update(settings: Record<string, unknown>) {
  if ("consent" in settings) consent = settings.consent;
  if ("channels" in settings) channels = channelIds(settings.channels);
  if ("owned" in settings) {
    try {
      owned = indexOwned(inventoryRows(settings.owned ?? []));
    } catch {
      owned = indexOwned([]);
    }
  }
  if ("wants" in settings) {
    const keys = new Set<string>();
    for (const item of parseOffering(String(settings.wants ?? ""))) {
      const key = objektKey(item);
      if (key) keys.add(key);
    }
    wantedKeys = keys;
  }
  revision++;
  seen = new WeakMap();
  // Enabling a channel makes its rows capturable, so the old verdicts no longer
  // hold. What was already recorded stays recorded.
  pausedRows.clear();
  unreadableSince.clear();
  for (const badge of document.querySelectorAll("objekt-match-badge"))
    badge.remove();
  const allowed = captureAllowed(consent);
  // Withdrawing consent mid-run stops the run as well as the reading.
  if (!allowed) searchSignal.cancelled = true;
  watch(allowed);
  // Re-reads what is already on screen, so enabling a channel or changing the
  // haves list takes effect without waiting for Discord to render something.
  if (allowed) visit(document.body);
}
/**
 * Wait, in a tab whose timers may be throttled.
 *
 * The rule and the racing live in `wait.ts`; this supplies the two timers and
 * the answer to "is this page hidden".
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function pace(ms: number): Promise<void> {
  return waitFor(ms, {
    hidden: () => document.visibilityState === "hidden",
    local: sleep,
    remote: (delay) =>
      extensionApi.runtime
        .sendMessage({ type: "wake", ms: delay })
        .then(() => undefined),
  });
}

/**
 * Hold the worker open for the length of a run.
 *
 * An MV3 worker is torn down after thirty seconds without work, which mid-run
 * takes the timer above and the open database with it. A connected port with
 * traffic on it is the documented way to say "still working"; the ping is well
 * inside the idle timeout, and both ends tolerate the port going away.
 */
let keepalive: ReturnType<typeof extensionApi.runtime.connect> | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
function holdWorkerOpen(on: boolean) {
  if (!on) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = undefined;
    keepalive?.disconnect();
    keepalive = null;
    return;
  }
  if (keepalive) return;
  try {
    keepalive = extensionApi.runtime.connect({ name: "objekt-run" });
    keepalive.onDisconnect.addListener(() => {
      keepalive = null;
    });
    keepaliveTimer = setInterval(() => {
      try {
        keepalive?.postMessage({ tick: Date.now() });
      } catch {
        keepalive = null;
      }
    }, 20_000);
  } catch {
    /* Worker unavailable; the run still works, it just may pause on restarts. */
  }
}

/**
 * When each code was last searched, so a repeat run continues rather than
 * restarts.
 *
 * Held in memory during a run and written once at the end: a storage write per
 * query, on top of everything else a run writes, is a lot of churn for a map
 * nothing reads until the next run.
 */
let searched = new Map<string, number>();
let searchedDirty = false;
function rememberQuery(query: string) {
  searched.set(query, Date.now());
  searchedDirty = true;
}
async function flushSearched() {
  if (!searchedDirty) return;
  searchedDirty = false;
  await extensionApi.storage.local.set({
    searchedAt: pruneSearchedAt(searched, DEFAULT_COOLDOWN_MS, Date.now()),
  });
}

// A full run outlives the panel, which can be closed at any point, so progress
// goes to storage and the panel reads it whenever it is shown.
const searchSignal = { cancelled: false };
let searching = false;
let lastProgress: Record<string, unknown> = {};
async function report(progress: Record<string, unknown>) {
  // Stamped so the panel can tell a run that is working from one that died with
  // the tab it was running in. Nothing else can: a content script that goes
  // away leaves `running: true` behind it, and the panel reported "Searching
  // 3/10…" until something else overwrote it.
  lastProgress = { ...progress, at: Date.now() };
  await extensionApi.storage.local.set({ searchProgress: lastProgress });
}

/**
 * A run does not survive its tab.
 *
 * Reloading Discord, following a link out of it, or closing the tab all tear
 * the content script down mid-run. This is best effort — the write may not
 * land before the page goes — which is why the panel also treats a progress
 * stamp that has stopped moving as an interrupted run.
 */
window.addEventListener("pagehide", () => {
  if (!searching) return;
  void extensionApi.storage.local.set({
    searchProgress: {
      ...lastProgress,
      running: false,
      stopped: "The Discord tab was closed or navigated away mid-run.",
      at: Date.now(),
    },
  });
});

/**
 * Posts this run has recorded, deduped by row id and cleared when a run starts.
 *
 * Counted here rather than from the index total because the index is
 * cumulative: the number worth watching is what this search is pulling in, not
 * how much was already sitting in storage.
 */
const runPosts = new Set<string>();
let postsReportedAt = 0;
/** Identifies the run in flight, so its posts can be exported on their own. */
let searchRun = "";
/**
 * Push the running total to the popup, rate-limited to keep storage writes sane.
 *
 * Skipping a write costs nothing: the run reports its own total on every page
 * and again when it finishes, so the number always lands even if the last few
 * posts arrive inside the window.
 */
function countPost(id: string) {
  if (!searching || runPosts.has(id)) return;
  runPosts.add(id);
  const now = Date.now();
  if (now - postsReportedAt < 400 || !lastProgress.running) return;
  postsReportedAt = now;
  void report({ ...lastProgress, posts: runPosts.size });
}

/**
 * The run's view of capture: how many rows on this results page are still
 * unaccounted for, and how many posts the run has banked.
 *
 * Rows are re-kicked here rather than only waited on. The mutation observer
 * catches rows as they are inserted, but a row re-rendered in place with the
 * same subtree can slip past it — polling from the settle loop closes that gap
 * instead of letting the page look finished when it is not.
 */
const captureProbe: CaptureProbe = {
  account: (rows) => {
    const now = Date.now();
    const tally = { recorded: 0, pending: 0, unreadable: 0 };
    for (const row of rows) {
      const key = rowKey(row);
      if (recorded.has(key)) {
        tally.recorded++;
        countPost(key);
        continue;
      }
      if (pausedRows.has(key)) continue;
      const since = unreadableSince.get(key);
      if (since !== undefined && now - since >= UNREADABLE_GRACE_MS) {
        tally.unreadable++;
        continue;
      }
      tally.pending++;
      void scan(row);
    }
    return tally;
  },
  posts: () => runPosts.size,
};
/**
 * This tab's id, asked for once and remembered.
 *
 * The panel needs it to act on the tab it is embedded in rather than on
 * whichever tab is active, and a content script cannot read it directly.
 */
let ownTabId: number | null = null;
async function tabId(): Promise<number | null> {
  if (ownTabId !== null) return ownTabId;
  try {
    const response = await extensionApi.runtime.sendMessage({ type: "tab-id" });
    if (response?.ok && typeof response.value === "number")
      ownTabId = response.value;
  } catch {
    /* Worker restarting; the panel still works, just against the active tab. */
  }
  return ownTabId;
}
async function showPanel() {
  await openPanel(await tabId());
}
extensionApi.runtime.onMessage.addListener((request, sender, reply) => {
  if (sender.id !== extensionApi.runtime.id) return;
  // Proof of life for the worker, which injects this script when there is none.
  if (request?.type === "ping") {
    reply({ ok: true, value: true });
    return true;
  }
  if (request?.type === "toggle-panel") {
    void tabId().then((id) => togglePanel(id));
    reply({ ok: true, value: true });
    return true;
  }
  if (request?.type === "open-panel") {
    void showPanel();
    reply({ ok: true, value: true });
    return true;
  }
  if (request?.type === "close-panel") {
    closePanel();
    reply({ ok: true, value: true });
    return true;
  }
  if (request?.type === "diagnose") {
    // Structure only, and only once capture has been agreed to: the readable
    // count is produced by parsing message bodies, which is the thing consent
    // governs.
    if (!captureAllowed(consent)) {
      reply({
        ok: false,
        error:
          "Agree to capture first — nothing on the page is read before that.",
      });
      return true;
    }
    // Reports which layer is failing: no reply at all means the content script
    // is not running; zero elements means the selector no longer matches
    // Discord's DOM; elements but nothing readable means the author/time
    // anchors moved; readable but not enabled means the channel is paused.
    const elements = [...document.querySelectorAll(MESSAGE_SELECTOR)];
    const readable = elements.filter((element) => readMessage(element));
    // Probe the anchors independently. If the container id changed but the
    // content/username ids did not, the selector is the only thing to fix.
    const count = (selector: string) =>
      document.querySelectorAll(selector).length;
    // Row shapes, take two. The first version stopped at the timestamp's own
    // id wrapper and only ever reported "message-timestamp-#", which says
    // nothing about the row. Walk out from each message body instead, past the
    // per-part ids, to whatever actually contains the message.
    const shape = (id: string) => id.replace(/\d{5,}/g, "#");
    const PART = /^message-(content|username|timestamp|accessories|reply)-/;
    const rowShapes = new Map<string, number>();
    for (const body of document.querySelectorAll(MESSAGE_BODY)) {
      const kind = body.closest(MESSAGE_SELECTOR) ? "channel" : "result";
      let owner: Element | null = body.parentElement;
      while (owner && (!owner.id || PART.test(owner.id)))
        owner = owner.parentElement;
      const key = `${kind}: ${owner ? `${owner.tagName.toLowerCase()}#${shape(owner.id)}` : "(no id above the body)"}`;
      rowShapes.set(key, (rowShapes.get(key) ?? 0) + 1);
    }
    // Structure only — tags, ids and roles, never message text — so one real
    // result row can be pasted back without leaking anyone's post.
    const outline = (node: Element | null, depth = 0): string[] => {
      if (!node || depth > 3) return [];
      const attrs = [
        node.id && `#${shape(node.id)}`,
        node.getAttribute("role") && `role=${node.getAttribute("role")}`,
        node.hasAttribute("data-list-item-id") &&
          `data-list-item-id=${shape(node.getAttribute("data-list-item-id") ?? "")}`,
        node.tagName === "A" &&
          `href=${shape(node.getAttribute("href") ?? "")}`,
        node.tagName === "TIME" && "time",
      ]
        .filter(Boolean)
        .join(" ");
      return [
        `${"  ".repeat(depth)}${node.tagName.toLowerCase()}${attrs ? ` ${attrs}` : ""}`,
        ...[...node.children]
          .slice(0, 6)
          .flatMap((child) => outline(child, depth + 1)),
      ];
    };
    const firstResult = resultBodies(document.body)[0];
    const panel = resultsPanel(document);
    reply({
      ok: true,
      value: {
        build:
          extensionApi.runtime.getManifest().version_name ??
          extensionApi.runtime.getManifest().version,
        url: location.href,
        channel: channelFromUrl(location.href),
        enabled: channels,
        elements: elements.length,
        readable: readable.length,
        sampleId: elements[0]?.id ?? null,
        searchBox: Boolean(findSearchBox(document)),
        skippedByChannel: Object.fromEntries(skipped),
        // Everything about the results panel, which is where captures were
        // silently coming from nowhere.
        results: {
          panel: panel
            ? panel.tagName.toLowerCase() + (panel.id ? `#${panel.id}` : "")
            : null,
          rows: resultRows(document).length,
          page: currentPage(document),
          nextControl: Boolean(findNextPage(document)),
          numberedPages: count('[aria-label^="Page "]'),
          rowShapes: Object.fromEntries(rowShapes),
          // The one thing a count cannot give: what a result row is made of.
          sampleRow: firstResult
            ? outline(rowOf(firstResult)).join("\n")
            : null,
        },
        probes: {
          chatMessages: count('[id^="chat-messages-"]'),
          messageContent: count('[id^="message-content-"]'),
          messageUsername: count('[id^="message-username-"]'),
          listItems: count("li[id]"),
          dataListItem: count("[data-list-item-id]"),
          times: count("time[datetime]"),
        },
      },
    });
    return true;
  }
  if (request?.type === "cancel-search") {
    searchSignal.cancelled = true;
    reply({ ok: true, value: true });
    return true;
  }
  if (request?.type !== "run-search") return;
  if (!automationAllowed(consent)) {
    reply({
      ok: false,
      error:
        "Agree to run searches in the extension panel first — it types into Discord's own search box on your behalf.",
    });
    return true;
  }
  if (searching) {
    reply({ ok: false, error: "A search run is already in progress." });
    return true;
  }
  const wanted = searchQueries(String(request.wants ?? ""));
  if (!wanted.length) {
    reply({ ok: false, error: "No objekts recognized. Try YooYeon CC101." });
    return true;
  }
  const delayMs = Number(request.delayMs);
  const pages = Number(request.pages);
  // Skipping is opt-out rather than automatic: a run that quietly searched
  // nothing because everything was searched an hour ago would look broken.
  const cooldownMs = request.skipRecent === false ? 0 : DEFAULT_COOLDOWN_MS;
  const plan = planQueries(wanted, { searched, cooldownMs });
  const queries = plan.queries;
  const planNote = describePlan(plan);
  if (!queries.length) {
    reply({
      ok: false,
      error: plan.skipped.length
        ? `All ${plan.skipped.length} codes were searched in the last few hours. Untick “skip codes searched recently” to search them again.`
        : "Nothing to search.",
    });
    return true;
  }
  searching = true;
  markPanelBusy(true);
  holdWorkerOpen(true);
  searchSignal.cancelled = false;
  // A fresh run counts from zero, so the popup's total reflects this search.
  runPosts.clear();
  postsReportedAt = 0;
  searchRun = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  void extensionApi.storage.local.set({ searchRunId: searchRun });
  // Reply now: a run outlives the click that started it.
  reply({ ok: true, value: { total: queries.length, note: planNote } });
  void report({
    done: 0,
    total: queries.length,
    query: "",
    posts: 0,
    running: true,
    planNote,
  })
    .then(() =>
      runSearches(document, queries, {
        // Zero is the normal setting: the settle gate paces the run by how fast
        // Discord actually answers, so there is no floor to enforce here.
        delayMs: Number.isFinite(delayMs)
          ? Math.min(60_000, Math.max(0, delayMs))
          : 0,
        pages: Number.isFinite(pages) ? Math.min(20, Math.max(1, pages)) : 1,
        signal: searchSignal,
        probe: captureProbe,
        onProgress: (progress) =>
          void report({ ...progress, running: true, planNote }),
        onQuerySearched: rememberQuery,
        wait: pace,
      }),
    )
    .then(
      (run) =>
        report({ ...run, total: queries.length, running: false, planNote }),
      (error) =>
        report({
          done: 0,
          total: queries.length,
          posts: runPosts.size,
          running: false,
          stopped: error instanceof Error ? error.message : "Search failed.",
        }),
    )
    .finally(() => {
      searching = false;
      markPanelBusy(false);
      holdWorkerOpen(false);
      void flushSearched();
    });
  return true;
});
extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const settings: Record<string, unknown> = {};
  if (changes.searchedAt && !searchedDirty)
    searched = readSearchedAt(changes.searchedAt.newValue);
  for (const key of ["consent", "channels", "owned", "wants"])
    if (changes[key]) settings[key] = changes[key].newValue;
  if (Object.keys(settings).length) update(settings);
});
void extensionApi.storage.local
  .get(["consent", "channels", "owned", "wants", "panel", "searchedAt"])
  .then((settings) => {
    searched = readSearchedAt(settings.searchedAt);
    update(settings);
    // The panel is a window, so it stays where it was: open across reloads and
    // across channel switches, until it is closed on purpose.
    if (readPanelState(settings.panel).open) void showPanel();
  });
/**
 * Report Discord's theme, so the panel can match it.
 *
 * Discord marks its own root with `theme-light` / `theme-dark`; that is a
 * Discord setting rather than an operating-system one, so `prefers-color-scheme`
 * would be wrong here about as often as it was right.
 */
function publishTheme() {
  const theme = document.documentElement.classList.contains("theme-light")
    ? "light"
    : "dark";
  void extensionApi.storage.local
    .get("discordTheme")
    .then((settings) => {
      if (settings.discordTheme !== theme)
        return extensionApi.storage.local.set({ discordTheme: theme });
    })
    .catch(() => {});
}
publishTheme();
new MutationObserver(publishTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["class"],
});
watchPanelPlacement();
