import { objektKey, parseOffering } from "@/lib/discord/match";
import { formatSeasonNumberLabel } from "@/lib/objekt-label";
import type { ParsedItem } from "@/lib/paste-parser";
import {
  carriedPace,
  LEDGER_WINDOW_MS,
  readLedger,
  recentRequests,
} from "./adaptive-pace";
import { APP_ORIGIN } from "./app-origin";
import { extensionApi } from "./browser";
import {
  acceptAutomation,
  acceptCapture,
  automationAllowed,
  captureAllowed,
} from "./consent";
import { exportTranscript } from "./export";
import { DISCORD_MATCHES, resolveTab, type TabLike } from "./host-tab";
import { huntIsFresh, huntNotice } from "./hunt";
import { MATCH_LABEL } from "./match-tab";
import {
  formatLockout,
  lockoutRemaining,
  readRateLimitedAt,
} from "./rate-limit";
import {
  continuable,
  type PendingRun,
  readPendingRun,
  STALE_MS,
} from "./resume";
import {
  describeDuration,
  elapsedMs,
  formatAsOf,
  formatElapsed,
  formatRemaining,
  type RunStats,
  readRunStats,
  remainingMs,
} from "./run-clock";
import { searchQueryFor } from "./search";
import {
  DEFAULT_COOLDOWN_MS,
  loadHue,
  MAX_DELAY_S,
  planQueries,
  readSearchedAt,
  recommendedTuning,
  searchFilters,
  searchLoad,
} from "./search-plan";
import {
  type ChannelLabel,
  capturing,
  channelFromUrl,
  channelIds,
  channelLabelFromTitle,
  formatChannelLabel,
} from "./settings";
import type { Entry } from "./store";

/**
 * Where this copy of the panel is running.
 *
 * The same document is the floating panel inside Discord, the pop-out window,
 * and whatever else hosts it later. The only differences are which tab it acts
 * on and which buttons make sense, so the mode is a query parameter rather
 * than three copies of the UI.
 */
const params = new URLSearchParams(location.search);
const embedded = params.get("embedded") === "1";
/**
 * The tab an embedded panel is sitting in, which is the tab it acts on.
 *
 * Read through the raw string, because `Number(null)` is 0 and `Number.isFinite`
 * accepts it: the pop-out window, which carries no `tab` at all, was pinning
 * itself to tab id 0 and only worked because looking that tab up fails and the
 * fallback search runs anyway.
 */
const tabParam = params.get("tab");
const pinnedTab =
  tabParam !== null && /^\d+$/.test(tabParam) ? Number(tabParam) : null;

const tabs: {
  get: (id: number) => Promise<TabLike | undefined>;
  query: () => Promise<TabLike[]>;
} = {
  get: (id) => extensionApi.tabs.get(id),
  query: () => extensionApi.tabs.query({ url: DISCORD_MATCHES }),
};

/**
 * Whether this copy of the panel may call `tabs` itself.
 *
 * Firefox runs an extension page that a *web page* frames in the content
 * process rather than the extension process, and that scope has no `tabs` and
 * no `permissions` at all — they are undefined, not refused (Bugzilla 1443253).
 * The embedded panel is exactly that frame, so every tab lookup it made threw
 * and was caught as "no tab". Chrome gives the same frame the full API.
 *
 * The worker is in the privileged process in both browsers, so anything the
 * frame cannot do itself is asked of the worker instead.
 */
const ownTabsApi: typeof extensionApi.tabs | undefined = extensionApi.tabs;
const canUseTabs = typeof ownTabsApi?.query === "function";

/** The Discord tab this panel acts on. Throws with something readable if none. */
async function discordTab(): Promise<{
  id: number;
  url: string;
  title: string | null;
}> {
  if (canUseTabs) return resolveTab(tabs, pinnedTab);
  return await request("host-tab", { tab: pinnedTab });
}

/**
 * Send to a tab, from a scope that may not be allowed to address tabs.
 *
 * The worker relays it verbatim and hands back what the tab replied, including
 * the "Receiving end does not exist" that `toContentScript` reads to decide
 * whether to inject the content script and try again.
 */
function sendToTab(tabId: number, message: Record<string, unknown>) {
  if (canUseTabs) return extensionApi.tabs.sendMessage(tabId, message);
  return request("to-tab", { tabId, message });
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const status = element("status");
async function request(type: string, extra: Record<string, unknown> = {}) {
  const response = await extensionApi.runtime.sendMessage({ type, ...extra });
  if (!response?.ok)
    throw new Error(response?.error ?? "Extension unavailable");
  return response.value;
}

/** Say something in a region, and colour it by whether it went wrong. */
function say(target: HTMLElement, message: string, bad = false) {
  target.textContent = message;
  target.classList.toggle("bad", bad);
}

/**
 * A status set by a click outranks the one `render` derives, for a moment.
 *
 * `render` runs every time storage changes — during a run, several times a
 * second — and would otherwise overwrite "Opened in objekt.my/match" before
 * anyone could read it.
 */
let heldUntil = 0;
function tell(message: string, bad = false) {
  say(status, message, bad);
  heldUntil = Date.now() + 6000;
}

/**
 * Wire a button, and make it obvious that it is doing something.
 *
 * Every one of these round-trips to the worker or to a tab, so "did my click
 * land" is a real question — and a second click while the first is in flight
 * is how two inventory lookups or two deliveries happen.
 */
function action(
  id: string,
  run: () => Promise<void>,
  onError: (message: string) => void = (message) => tell(message, true),
) {
  const button = document.getElementById(id);
  if (!(button instanceof HTMLButtonElement)) return;
  let busy = false;
  button.addEventListener("click", () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    void run()
      .catch((error) => {
        onError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        busy = false;
        // A button whose state something longer-lived now owns is left alone.
        // Starting a run finishes this handler in a few hundred milliseconds
        // while the run itself goes on for minutes, and re-enabling the Search
        // button there would offer a second run on top of the first.
        if (button.dataset.hold === "1") return;
        button.disabled = false;
      });
  });
}

// ---------------------------------------------------------------------------
// Views

let consent: unknown;
let settingsOpen = false;

/**
 * Show only what the user has agreed to.
 *
 * Both stores require the disclosure to be in the extension's own UI and to be
 * agreed to before anything is collected, so nothing else is shown until it is.
 * Search needs its own agreement too, asked for the first time Search is
 * pressed rather than in the way of it: search is what the panel is for, so
 * its button is always there (see `gateOpen`).
 */
function showViews() {
  const capture = captureAllowed(consent);
  const automation = automationAllowed(consent);
  const captureRisk = element<HTMLInputElement>("accept-capture-risk");
  const acceptCapture = element<HTMLButtonElement>("accept-capture");
  if (!capture) captureRisk.checked = false;
  acceptCapture.disabled = !captureRisk.checked;
  element("consent").hidden = capture;
  element("main").hidden = !capture || settingsOpen;
  element("settings").hidden = !capture || !settingsOpen;
  if (automation) gateOpen = false;
  // The buttons, the search agreement and the tuning line depend on the run
  // and the setup as well, which `render` owns.
  render();
}

/**
 * Whether the search agreement is open, above the buttons. It opens the
 * first time Search is pressed, in the panel rather than over Discord, and
 * its own button agrees and starts that search in one go.
 */
let gateOpen = false;

// The embedded panel has the brand in its titlebar; a window has only this.
element("brand").hidden = embedded;

function openSettings(open: boolean) {
  settingsOpen = open;
  showViews();
  (open ? element("close-settings") : element("open-settings")).focus();
}
element("open-settings").addEventListener("click", () => openSettings(true));
element("close-settings").addEventListener("click", () => openSettings(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && settingsOpen) openSettings(false);
});

async function readConsentSetting(): Promise<unknown> {
  const stored = await extensionApi.storage.local.get("consent");
  return stored.consent;
}

element<HTMLInputElement>("accept-capture-risk").addEventListener(
  "change",
  (event) => {
    element<HTMLButtonElement>("accept-capture").disabled = !(
      event.currentTarget as HTMLInputElement
    ).checked;
  },
);

action("accept-capture", async () => {
  consent = acceptCapture(await readConsentSetting());
  await extensionApi.storage.local.set({ consent });
  showViews();
  await refresh();
});

action("accept-automation", async () => {
  consent = acceptAutomation(await readConsentSetting());
  await extensionApi.storage.local.set({ consent });
  gateOpen = false;
  showViews();
  // They pressed Search to get here; agreeing is pressing it again.
  await startSearch();
});

element("decline-automation").addEventListener("click", () => {
  gateOpen = false;
  render();
  element("run-search").focus();
});

action(
  "withdraw",
  async () => {
    if (
      !confirm(
        "Stop reading Discord and forget your agreement? Posts already captured are kept. Clear them separately if you want them gone.",
      )
    )
      return;
    await extensionApi.storage.local.remove("consent");
    consent = undefined;
    settingsOpen = false;
    showViews();
  },
  (message) => say(element("diagnosis"), message, true),
);

// ---------------------------------------------------------------------------
// Wants, as cards

interface Tile {
  key: string;
  item: ParsedItem;
  name: string;
  code: string;
  query: string;
}

/**
 * One card per distinct objekt in the want list, in the order typed.
 *
 * "Any member" wants have no objekt key, so they are keyed by code instead —
 * they still get a card, just never a picture or a count.
 */
function tilesFrom(text: string): Tile[] {
  const tiles = new Map<string, Tile>();
  for (const item of parseOffering(text)) {
    if (item.freeform || !item.collectionNo) continue;
    const code = formatSeasonNumberLabel({ ...item, collectionId: "" });
    const key =
      objektKey(item) ??
      `any|${item.season}|${item.collectionNo}`.toLowerCase();
    if (tiles.has(key)) continue;
    tiles.set(key, {
      key,
      item,
      name: item.member ?? "Any",
      code,
      query: searchQueryFor(item),
    });
  }
  return [...tiles.values()];
}

const wants = element<HTMLTextAreaElement>("wants");
const tileList = element<HTMLUListElement>("tiles");
let tiles: Tile[] = [];
const art = new Map<string, string | null>();
/**
 * Cards taken out of the search with their ✕. The text keeps them — "sy
 * cc101-116" still reads as a range — so this is what the run skips, and a key
 * is forgotten once its code is no longer typed at all.
 */
let removed = new Set<string>();

/** The cards a search will actually look for. */
function searchTiles(): Tile[] {
  return tiles.filter((tile) => !removed.has(tile.key));
}

function readRemoved(value: unknown): Set<string> {
  return new Set(
    Array.isArray(value)
      ? value.filter((key): key is string => typeof key === "string")
      : [],
  );
}

function setRemoved(next: Set<string>) {
  removed = next;
  void extensionApi.storage.local.set({ removedWants: [...next] });
}

/** Drop removals whose card has left the want list. */
function pruneRemoved() {
  const present = new Set(tiles.map((tile) => tile.key));
  const kept = new Set([...removed].filter((key) => present.has(key)));
  if (kept.size !== removed.size) setRemoved(kept);
}

function removeTile(key: string) {
  const shown = searchTiles();
  const at = shown.findIndex((tile) => tile.key === key);
  setRemoved(new Set([...removed, key]));
  showWantsCount();
  render();
  // Keep keyboard focus in the grid rather than dropping it on the page.
  const next = shown[at + 1] ?? shown[at - 1];
  const button = next && tileNodes.get(next.key)?.remove;
  if (button) button.focus();
  else wants.focus();
}

element("restore-wants").addEventListener("click", () => {
  setRemoved(new Set());
  showWantsCount();
  render();
  wants.focus();
});

interface TileNode {
  li: HTMLLIElement;
  frame: HTMLElement;
  img: HTMLImageElement;
  badge: HTMLElement;
  remove: HTMLButtonElement;
}
const tileNodes = new Map<string, TileNode>();
/** Keys whose art has been asked of the worker and not answered yet. */
const artPending = new Set<string>();

/** An icon from the sprite in panel.html. */
function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "i");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

function tileNode(tile: Tile): TileNode {
  const existing = tileNodes.get(tile.key);
  if (existing) return existing;
  const li = document.createElement("li");
  li.className = "tile";
  const frame = document.createElement("div");
  frame.className = "art";
  // The card reads as loading until its art arrives, then fades it in; one
  // with no art says its code instead (see `artState`).
  frame.dataset.art = "loading";
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  const code = document.createElement("span");
  code.className = "code";
  code.textContent = tile.code;
  img.addEventListener("error", () => {
    img.dataset.failed = img.getAttribute("src") ?? "";
    frame.dataset.art = "none";
  });
  img.addEventListener("load", () => {
    frame.dataset.art = "loaded";
  });
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.hidden = true;
  frame.append(img, code, badge);
  // Member over code, a line each: on one line a card's width fit "SeoYeon"
  // and an ellipsis, which dropped the half that tells two cards apart.
  const name = document.createElement("span");
  name.className = "name";
  const member = document.createElement("span");
  member.textContent = tile.name;
  const collection = document.createElement("span");
  collection.textContent = tile.code;
  name.append(member, collection);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.append(icon("x"));
  remove.title = "Leave this one out of the search";
  remove.setAttribute(
    "aria-label",
    `Remove ${tile.name} ${tile.code} from the search`,
  );
  remove.addEventListener("click", () => removeTile(tile.key));
  li.append(frame, remove, name);
  const node = { li, frame, img, badge, remove };
  tileNodes.set(tile.key, node);
  return node;
}

/**
 * Whether a card is waiting for its art, showing it, or has none to show.
 *
 * "Any member" wants never get a picture, and a lookup the worker skipped —
 * past its per-batch cap, or a request that failed — is not left pulsing
 * forever: it shows its code until the next lookup tries again.
 */
function artState(tile: Tile, node: TileNode): string {
  const url = art.get(tile.key);
  if (url) {
    if (node.img.dataset.failed === url) return "none";
    return node.img.complete &&
      node.img.naturalWidth > 0 &&
      node.img.getAttribute("src") === url
      ? "loaded"
      : "loading";
  }
  return tile.item.member && artPending.has(tile.key) ? "loading" : "none";
}

type TileState = "idle" | "queued" | "active" | "done" | "recent";

/**
 * Where a card's code sits in the run, read off the run's own report.
 *
 * `done` counts queries submitted, and a query is submitted before its pages
 * are walked, so while a run is going the last one counted is the one in hand.
 */
function tileState(tile: Tile): TileState {
  const queries = Array.isArray(progress?.queries) ? progress.queries : [];
  const index = tile.query ? queries.indexOf(tile.query) : -1;
  const done = typeof progress?.done === "number" ? progress.done : 0;
  if (index !== -1) {
    if (running())
      return index < done - 1
        ? "done"
        : index === done - 1
          ? "active"
          : "queued";
    if (index < done) return "done";
  }
  const at = searchedAt.get(tile.query);
  return at !== undefined && Date.now() - at < DEFAULT_COOLDOWN_MS
    ? "recent"
    : "idle";
}

function renderTiles() {
  const shown = searchTiles();
  const keep = new Set(shown.map((tile) => tile.key));
  for (const [key, node] of tileNodes)
    if (!keep.has(key)) {
      node.li.remove();
      tileNodes.delete(key);
    }
  shown.forEach((tile, index) => {
    const node = tileNode(tile);
    if (tileList.children[index] !== node.li)
      tileList.insertBefore(node.li, tileList.children[index] ?? null);
    const url = art.get(tile.key);
    if (url && node.img.getAttribute("src") !== url) {
      node.img.loading = index < 24 ? "eager" : "lazy";
      node.img.src = url;
    }
    node.frame.dataset.art = artState(tile, node);
    const state = tileState(tile);
    node.li.dataset.state = state;
    // A count only means something for a card this search looked for.
    const hits = summary.hits[tile.key] ?? 0;
    const counted = state === "done" || (state !== "queued" && hits > 0);
    node.badge.hidden = !counted;
    node.badge.textContent = String(hits);
    node.badge.classList.toggle("zero", hits === 0);
    node.li.title = [
      `${tile.name} ${tile.code}`,
      counted ? `${hits} post${hits === 1 ? "" : "s"} have it` : "",
      state === "recent" ? "searched in the last 6 hours" : "",
      state === "active" ? "searching now" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  });
}

/**
 * Count what the parser will actually recognise, as it is typed.
 *
 * A list is only as good as what comes out of the parser, and a stray heading
 * or a format it does not know reads as nothing at all. Saying so at the point
 * of typing beats finding out after a run returns nothing.
 */
function showWantsCount() {
  const count = element("wants-count");
  const text = wants.value.trim();
  if (!text) {
    count.textContent = "";
    count.classList.remove("none");
    element("restore-wants").hidden = true;
    return;
  }
  const lines = text.split("\n").filter((line) => line.trim()).length;
  // Fewer objekts than lines means some lines read as nothing — usually a
  // heading, sometimes a format the parser does not know. Worth a word.
  const found = parseOffering(wants.value).length;
  const shown = searchTiles().length;
  const restore = element<HTMLButtonElement>("restore-wants");
  restore.hidden = removed.size === 0;
  restore.textContent = `${removed.size} removed · restore`;
  count.classList.toggle("none", tiles.length === 0);
  count.textContent = !tiles.length
    ? "Nothing recognised yet. Try “SeoYeon CC101”"
    : `${plural(shown, "objekt")}${found < lines ? " · some lines not recognised" : ""}`;
}

let artTimer: ReturnType<typeof setTimeout> | undefined;
/** Ask the worker for art the panel does not have yet, once typing pauses. */
function fetchArt() {
  clearTimeout(artTimer);
  const missing = tiles.filter(
    (tile) => tile.item.member && !art.has(tile.key),
  );
  // Marked before the pause, so a card that has just appeared pulses as
  // loading rather than flashing its code first.
  for (const tile of missing) artPending.add(tile.key);
  if (!missing.length) return;
  artTimer = setTimeout(() => {
    const asked = tiles
      .filter((tile) => tile.item.member && !art.has(tile.key))
      .map((tile) => tile.key);
    if (!asked.length) return;
    void request("artwork", {
      items: tiles
        .filter((tile) => asked.includes(tile.key))
        .map(({ item }) => ({
          member: item.member,
          season: item.season,
          collectionNo: item.collectionNo,
        })),
    })
      .then((urls: Record<string, string | null>) => {
        for (const [key, url] of Object.entries(urls)) art.set(key, url);
      })
      .catch(() => {})
      .finally(() => {
        for (const key of asked) artPending.delete(key);
        renderTiles();
      });
  }, 350);
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function wantsChanged(save: boolean) {
  tiles = tilesFrom(wants.value);
  pruneRemoved();
  fetchArt();
  showWantsCount();
  showHunt();
  renderTiles();
  render();
  if (!save) return;
  // Saved as typed, not only when a run starts: the content script marks posts
  // that have something on this list, and the next panel opened should find it.
  clearTimeout(saveTimer);
  unsaved = true;
  saveTimer = setTimeout(() => {
    unsaved = false;
    void extensionApi.storage.local.set({ wants: wants.value });
    void refresh();
  }, 600);
}
wants.addEventListener("input", () => wantsChanged(true));
/** Typed but not yet saved, because the pause after typing has not come. */
let unsaved = false;
// Closing or reloading the panel inside that pause used to lose what was
// just typed; the write is started on the way out instead.
addEventListener("pagehide", () => {
  if (!unsaved) return;
  clearTimeout(saveTimer);
  unsaved = false;
  void extensionApi.storage.local.set({ wants: wants.value });
});

// ---------------------------------------------------------------------------
// A hunt sent from objekt.my
//
// The bridge on objekt.my writes the want list straight into storage, so the
// list itself arrives through `storage.onChanged` like any other panel's edit.
// This is the part that says where it came from, and undoes it.

let huntAt: unknown = null;
let wantsBeforeHunt = "";

function showHunt() {
  const note = element("hunt-note");
  const fresh = huntIsFresh(huntAt, Date.now());
  note.hidden = !fresh;
  if (!fresh) return;
  element("hunt-text").textContent = huntNotice(tiles.length);
  element("undo-hunt").hidden = !wantsBeforeHunt.trim();
}

function readHuntState(settings: Record<string, unknown>) {
  if ("huntAt" in settings) huntAt = settings.huntAt;
  if ("wantsBeforeHunt" in settings)
    wantsBeforeHunt =
      typeof settings.wantsBeforeHunt === "string"
        ? settings.wantsBeforeHunt
        : "";
}

element("undo-hunt").addEventListener("click", () => {
  const before = wantsBeforeHunt;
  if (!before.trim()) return;
  wants.value = before;
  wantsChanged(false);
  huntAt = null;
  wantsBeforeHunt = "";
  showHunt();
  void extensionApi.storage.local.set({ wants: before });
  void extensionApi.storage.local.remove(["huntAt", "wantsBeforeHunt"]);
  tell("Restored your previous list.");
});

element("dismiss-hunt").addEventListener("click", () => {
  huntAt = null;
  showHunt();
  void extensionApi.storage.local.remove(["huntAt"]);
});
wants.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    element<HTMLButtonElement>("run-search").click();
  }
});

// ---------------------------------------------------------------------------
// Getting started
//
// Three things have to be true before the panel can do anything useful:
// Discord open in this browser, a server channel open in it, and something
// to look for. Until they are, the content column says which one is missing
// and offers the click that fixes it — in the panel itself, not in a popup
// over Discord. Once there are cards it shrinks to the one step still missing,
// and once all three hold it goes away and the footer leads.

/**
 * Whether the panel has looked at Discord yet. Until then it does not know
 * which step is missing, and guessing would flash "Open Discord" at someone
 * already in their trade channel every time the panel opens.
 */
let placed = false;
/** A Discord tab exists for this panel to act on. */
let hasTab = false;
/** Discord is showing its login or sign-up page rather than the app. */
let loggedOut = false;

function loginPage(url: string | null | undefined): boolean {
  try {
    return url ? /^\/(login|register)\b/.test(new URL(url).pathname) : false;
  } catch {
    return false;
  }
}

/** The getting-started step still to do, or null once all three are done. */
function setupStep(): string | null {
  if (!hasTab) return "guide-discord";
  if (!hasChannel) return "guide-channel";
  if (!tiles.length) return "guide-wants";
  return null;
}

function showGuide() {
  const steps: [string, boolean][] = [
    ["guide-discord", hasTab],
    ["guide-channel", hasChannel],
    ["guide-wants", tiles.length > 0],
  ];
  const current = setupStep();
  // With Discord and a channel in place, the want list is the step, and the
  // box itself says so — a list pointing "above" at it was easy to miss. The
  // box stays where it is, so nothing moves under someone starting to type.
  const asking = placed && current === "guide-wants";
  const guide = element("guide");
  guide.hidden = !placed || !current || asking;
  guide.classList.toggle("compact", tiles.length > 0);
  element("empty").hidden = !asking;
  element("wants-field").classList.toggle("ask", asking);
  element("wants-label").textContent = tiles.length
    ? "Looking for"
    : "What are you looking for?";
  for (const [id, done] of steps)
    element(id).dataset.state = done
      ? "done"
      : id === current
        ? "current"
        : "todo";
  element("guide-channel-title").textContent = loggedOut
    ? "Log in to Discord"
    : "Go to a trade channel";
  element("guide-channel-text").textContent = loggedOut
    ? "Then open the server channel where people post their haves and wants. Your login stays with Discord: the extension never sees it."
    : "Open the server channel where people post their haves and wants. Posts you scroll past are kept from then on. Direct messages are never read.";
  // Only a window needs a way to Discord; the embedded panel is already on it.
  element("show-discord").hidden = embedded || !hasTab;
  const chip = element("no-channel-text");
  chip.textContent = !hasTab
    ? "Discord not open"
    : loggedOut
      ? "Not logged in"
      : "No channel";
}

for (const link of document.querySelectorAll<HTMLAnchorElement>(
  ".collection-link",
))
  link.href = `${APP_ORIGIN}/collection`;

/** The pop-out window, as opposed to the embedded panel or a plain tab. */
const windowed = params.get("window") === "1";

action("open-discord", async () => {
  // The panel moves into Discord with it: opened in the tab the worker finds
  // or creates, and this window closed, so there is still one panel.
  await request("show-discord", { dock: true });
  if (windowed) await request("close-window").catch(() => {});
});

action("show-discord", async () => {
  await request("show-discord", { dock: false });
});

// ---------------------------------------------------------------------------
// The run and what it found

let progress: Record<string, unknown> | null = null;
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}
let summary: {
  total: number;
  run: number;
  hits: Record<string, number>;
  /** Newest post time (ms) in the index, and in the current run. */
  newest?: number | null;
  newestRun?: number | null;
} = {
  total: 0,
  run: 0,
  hits: {},
};
let runId: string | null = null;
/** The unfinished run Continue would pick up, if there is one. */
let pending: PendingRun | null = null;
let searchedAt = new Map<string, number>();
/** What the last Search was pressed with (`searchFilters`), if known. */
let lastFilters: string | null = null;
let captureError: string | null = null;
/** When a run last stopped looking rate-limited; see rate-limit.ts. */
let rateLimitedAt: number | null = null;
/** What finished runs measured, for the time estimate. */
let runStats: RunStats | null = null;
/** The pace a recent run was pushed to, and recent request times. */
let storedPace: unknown = null;
let requestLedger: number[] = [];
/**
 * The rate limit the user ticked "I understand the risks" for. Good for one
 * run against that one rate limit: a new stall, or starting a run, clears it.
 */
let overrideFor: number | null = null;
/** When the warning was opened; the box cannot be ticked until it is read. */
let warningOpenedAt: number | null = null;
/** How long the warning must be on screen before it can be acknowledged. */
const WARNING_READ_MS = 8_000;

function coolingDown(): boolean {
  return !running() && lockoutRemaining(rateLimitedAt, Date.now()) > 0;
}

function overridden(): boolean {
  return rateLimitedAt !== null && overrideFor === rateLimitedAt;
}

/** Close the warning and forget the acknowledgement. */
function resetOverride() {
  overrideFor = null;
  warningOpenedAt = null;
  element<HTMLInputElement>("cooldown-ack").checked = false;
}

/** The countdown, the warning and its tick box, in step with the clock. */
function showCooldown() {
  const cooling = coolingDown();
  element("cooldown").hidden = !cooling || element("actions").hidden;
  if (!cooling) {
    if (overrideFor !== null || warningOpenedAt !== null) resetOverride();
  } else {
    element("cooldown-left").textContent = formatLockout(
      lockoutRemaining(rateLimitedAt, Date.now()),
    );
  }
  const open = warningOpenedAt !== null;
  element("cooldown-warning").hidden = !open;
  element("cooldown-ack-row").hidden = !open;
  const opener = element<HTMLButtonElement>("cooldown-open");
  opener.setAttribute("aria-expanded", String(open));
  opener.textContent = open ? "Wait instead" : "Continue anyway…";
  const readFor =
    warningOpenedAt === null
      ? 0
      : warningOpenedAt + WARNING_READ_MS - Date.now();
  element<HTMLInputElement>("cooldown-ack").disabled = readFor > 0;
  element("cooldown-ack-text").textContent =
    readFor > 0
      ? `Read the warning above. You can tick this in ${Math.ceil(readFor / 1000)}s.`
      : "I understand the risks to my Discord account and want to search anyway.";
}
let hasChannel = false;

function stale(): boolean {
  const at = typeof progress?.at === "number" ? progress.at : 0;
  return progress?.running === true && at > 0 && Date.now() - at > STALE_MS;
}
/** A run whose reports have stopped is not a run any more, whatever the flag says. */
function running(): boolean {
  return progress?.running === true && !stale();
}

/**
 * Everything a run reported, for Troubleshooting.
 *
 * The main status line says what happened in a few words; this keeps the
 * detail that makes a misbehaving run diagnosable — retries, which insertion
 * carried it, why paging stopped — one click away rather than in everyone's
 * face.
 */
function describe(p: Record<string, unknown> | null): string {
  if (!p) return "";
  const done = typeof p.done === "number" ? p.done : 0;
  const total = typeof p.total === "number" ? p.total : 0;
  const planNote =
    typeof p.planNote === "string" && p.planNote ? `\n${p.planNote}` : "";
  if (p.running) {
    if (stale())
      return `Stopped reporting after ${done}/${total}. The Discord tab was probably reloaded or closed. Anything captured is still in the index.`;
    if (typeof p.retry === "number")
      return `Discord's search box went away before ${p.query || "the next code"}. Retry ${p.retry} of ${p.retries} · ${done}/${total}…${planNote}`;
    if (typeof p.paused === "string" && p.paused)
      return `${p.paused} · ${done}/${total}${planNote}`;
    if (p.waiting)
      return `Waiting for Discord's search box before ${p.query || "the next code"} · ${done}/${total}…${planNote}`;
    return `Searching ${done}/${total}${p.query ? ` · ${p.query}` : ""}${
      typeof p.page === "number" ? ` · page ${p.page}` : ""
    }…${planNote}`;
  }
  const pages =
    typeof p.pagesWalked === "number" ? ` · ${p.pagesWalked} pages walked` : "";
  const retries =
    typeof p.retried === "number" && p.retried > 0
      ? ` · ${p.retried} ${p.retried === 1 ? "retry" : "retries"}`
      : "";
  const names = emptyQueries(p);
  const empty =
    typeof p.empty === "number" && p.empty > 0
      ? ` · ${p.empty} with no matches${names.length ? ` (${names.join(", ")})` : ""}`
      : "";
  const closed =
    typeof p.closed === "number" && p.closed > 0
      ? ` · ${p.closed} cut short by the results closing`
      : "";
  const errors =
    typeof p.searchErrors === "number" && p.searchErrors > 0
      ? ` · ${plural(p.searchErrors, "search error")}`
      : "";
  const slowed =
    typeof p.peakPaceMs === "number" &&
    typeof p.delayMs === "number" &&
    p.peakPaceMs > p.delayMs
      ? ` · slowed to +${Math.round(p.peakPaceMs / 1000)}s/page at the most, ended at +${Math.round(
          (typeof p.paceMs === "number" ? p.paceMs : p.peakPaceMs) / 1000,
        )}s`
      : "";
  const typed =
    p.typedBy && typeof p.typedBy === "object"
      ? Object.entries(p.typedBy as Record<string, number>)
          .map(([name, count]) => `${name}×${count}`)
          .join(", ")
      : "";
  const note = ["pagerNote", "settleNote"]
    .map((key) => p[key])
    .filter((text): text is string => typeof text === "string" && text !== "")
    .map((text) => `\n⚠ ${text}`)
    .join("");
  if (typeof p.stopped === "string" && p.stopped)
    return `Stopped after ${done}/${total}${pages}${errors}${slowed}: ${p.stopped}${planNote}${note}`;
  return total
    ? `Finished ${done}/${total} searches${pages}${retries}${errors}${slowed}${empty}${closed}.${
        typed ? `\ntyped via ${typed}` : ""
      }${planNote}${note}`
    : "";
}

function emptyQueries(p: Record<string, unknown>): string[] {
  return Array.isArray(p.emptyQueries)
    ? p.emptyQueries
        .filter((query): query is string => typeof query === "string")
        .slice(0, 4)
    : [];
}

function readFilters(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Pages per objekt as a run would read it. */
function pageSetting(): number {
  return Math.min(20, Math.max(1, Number(pages.value) || DEFAULT_PAGES));
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The one line under the cards. Short; the detail is in Troubleshooting. */
function statusLine(): { text: string; bad: boolean } {
  if (captureError) return { text: captureError, bad: true };
  const p = progress;
  const done = typeof p?.done === "number" ? p.done : 0;
  const total = typeof p?.total === "number" ? p.total : 0;
  if (p && stale())
    return {
      text: `Stopped reporting after ${done}/${total}. The Discord tab was probably reloaded.`,
      bad: true,
    };
  if (p && running() && typeof p.paused === "string" && p.paused)
    return { text: `${p.paused} · ${done}/${total}`, bad: true };
  if (p && running()) {
    const left = remainingMs(p, Date.now());
    const spent = elapsedMs(p, Date.now());
    const eta = `${spent === null ? "" : ` · ${formatElapsed(spent)} elapsed`}${
      left === null ? "" : ` · ${formatRemaining(left)}`
    }`;
    return {
      text:
        typeof p.retry === "number"
          ? `Discord's search box went away. Waiting to retry (${p.retry}/${p.retries}) · ${done}/${total}`
          : p.waiting
            ? `Waiting for Discord to load · ${done}/${total}${eta}`
            : `Searching ${p.query ? `${p.query} · ` : ""}${done}/${total}${
                typeof p.paceMs === "number" &&
                typeof p.delayMs === "number" &&
                p.paceMs > p.delayMs
                  ? ` · Discord pushed back, slowed to +${Math.round(p.paceMs / 1000)}s`
                  : ""
              }${eta}`,
      bad: false,
    };
  }
  if (typeof p?.stopped === "string" && p.stopped && p.stopped !== "Cancelled.")
    return { text: p.stopped, bad: true };
  if (p && total) {
    const nothing = emptyQueries(p);
    const newest = runId ? summary.newestRun : summary.newest;
    // Only a run that says when it finished: one whose tab went away never did.
    const took =
      typeof p.finishedAt === "number" ? elapsedMs(p, Date.now()) : null;
    return {
      text: `${p.stopped ? "Stopped · " : ""}${plural(summary.run, "post")} found${
        took === null ? "" : ` · took ${formatElapsed(took)}`
      }${
        newest ? ` · ${formatAsOf(newest)}` : ""
      }${nothing.length ? ` · nothing for ${nothing.join(", ")}` : ""}`,
      bad: false,
    };
  }
  // Until there is a channel, the getting-started steps say what to do.
  if (!hasChannel) return { text: "", bad: false };
  return { text: "", bad: false };
}

/** Put the whole main view in step with what is currently known. */
function render() {
  const busy = running();
  showRunning(busy);
  const line = statusLine();
  if (Date.now() >= heldUntil || line.bad) say(status, line.text, line.bad);
  say(element("run-detail"), describe(progress));
  const ready = runId ? summary.run : summary.total;
  const queries = new Set(
    searchTiles()
      .map((tile) => tile.query)
      .filter(Boolean),
  );
  // An unfinished run is the thing to do next, so it takes the main button:
  // after a crash, searching again is how a long list started from nothing.
  const left = busy ? null : continuable(pending, queries, Date.now());
  const carryOn = element<HTMLButtonElement>("continue-search");
  carryOn.hidden = !left;
  if (left) {
    carryOn.textContent = `Continue · ${left.left} left`;
    carryOn.title = `Carries on from ${left.next}, under the same search`;
  }
  // Cards or page depth changed since the last Search: what match would open
  // is from a different search, so searching takes the main button instead.
  const changed =
    !busy &&
    !left &&
    lastFilters !== null &&
    lastFilters !== searchFilters(queries, pageSetting());
  const searching = automationAllowed(consent);
  // Open in match waits for a search. Before one, all it could send is the
  // handful of posts scrolled past — "Open 11 in match" — which undersells
  // what a search finds and was easy to press by mistake.
  const searched = runId !== null;
  const open = element<HTMLButtonElement>("open-match");
  open.hidden = busy || !searched || ready === 0;
  open.textContent = `Open ${ready} in match`;
  open.title = "Send the posts from your last search to objekt.my/match";
  open.classList.toggle("primary", !left && !changed);
  const search = element<HTMLButtonElement>("run-search");
  const searchFirst = !left && (open.hidden || changed || !searched);
  search.classList.toggle("primary", searchFirst);
  if (!busy) {
    search.textContent = searchFirst
      ? queries.size
        ? `Search ${plural(queries.size, "code")}`
        : "Search"
      : "Search again";
  }
  // The content script refuses too; this just stops offering the click.
  // `hold` keeps the click handler from re-enabling it when a refused
  // request returns.
  showCooldown();
  if (!busy) {
    const blocked = coolingDown() && !overridden();
    for (const button of [search, carryOn]) {
      button.disabled = blocked;
      button.dataset.hold = blocked ? "1" : "";
    }
    if (coolingDown())
      search.textContent = blocked
        ? `Paused · ${formatLockout(lockoutRemaining(rateLimitedAt, Date.now()))}`
        : "Search anyway";
    if (coolingDown() && left)
      carryOn.textContent = `${overridden() ? "Continue anyway" : "Continue"} · ${left.left} left`;
  }
  renderTiles();
  showGuide();
  // While the agreement is open its buttons are the ones to press.
  element("automation-gate").hidden = !gateOpen || searching;
  element("actions").hidden = gateOpen && !searching;
  showTuning();
  element("foot").classList.toggle(
    "empty",
    !status.textContent &&
      [
        "search-progress",
        "automation-gate",
        "tuning",
        "cooldown",
        "actions",
        "open-match",
      ].every((id) => element(id).hidden),
  );
}

/** Keep the bar and the buttons in step with the run. */
function showRunning(busy: boolean) {
  const bar = element("search-progress");
  const done = typeof progress?.done === "number" ? progress.done : 0;
  const total = typeof progress?.total === "number" ? progress.total : 0;
  bar.hidden = !busy;
  const fill = bar.firstElementChild;
  if (fill instanceof HTMLElement)
    fill.style.width = `${total ? Math.min(100, (done / total) * 100) : 0}%`;
  element("stop-search").hidden = !busy;
  const start = element<HTMLButtonElement>("run-search");
  // Claimed for as long as the run lasts, so the click handler that started it
  // does not hand the button back when it returns.
  start.dataset.hold = busy ? "1" : "";
  start.dataset.busy = busy ? "1" : "";
  start.disabled = busy;
  if (busy) start.textContent = "Searching…";
}

/**
 * Re-read storage, the tab and the index, then render.
 *
 * Coalesced: during a run storage changes several times a second, and each
 * refresh reads the index once. A refresh asked for while one is in flight
 * runs once more afterwards rather than once per request.
 */
let refreshing = false;
let refreshAgain = false;
/** Where the panel last saw Discord, as `placeKey` spells it. */
let shownChannel = "";
/**
 * The Discord tab's state as far as the panel shows it: whether there is one,
 * whether it is logged out, the channel and its name. The getting-started
 * steps follow the first two, so a Discord tab opening or a login finishing is
 * a change worth a refresh just as a channel switch is.
 */
function placeKey(
  tab: { url: string; title: string | null } | null,
  channel: string | null,
  label: ChannelLabel | null,
) {
  return [
    tab ? "tab" : "",
    loginPage(tab?.url) ? "login" : "",
    channel ?? "",
    label ? formatChannelLabel(label) : "",
  ].join("\n");
}
async function refresh(): Promise<void> {
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  try {
    const settings = await extensionApi.storage.local.get([
      "captureError",
      "captureHealth",
      "pausedChannels",
      "pendingRun",
      "searchProgress",
      "searchRunId",
      "searchedAt",
      "lastSearchFilters",
      "rateLimitedAt",
      "runStats",
      "searchPace",
      "searchLedger",
    ]);
    captureError =
      typeof settings.captureError === "string" ? settings.captureError : null;
    progress = asRecord(settings.searchProgress);
    pending = readPendingRun(settings.pendingRun);
    runId =
      typeof settings.searchRunId === "string" && settings.searchRunId
        ? settings.searchRunId
        : null;
    searchedAt = readSearchedAt(settings.searchedAt);
    lastFilters = readFilters(settings.lastSearchFilters);
    rateLimitedAt = readRateLimitedAt(settings.rateLimitedAt);
    runStats = readRunStats(settings.runStats);
    storedPace = settings.searchPace;
    requestLedger = readLedger(settings.searchLedger);
    showHealth(settings.captureHealth);
    const tab = await discordTab().catch(() => null);
    const channel = channelFromUrl(tab?.url);
    const label = channel ? channelLabelFromTitle(tab?.title) : null;
    hasChannel = channel !== null;
    hasTab = tab !== null;
    loggedOut = loginPage(tab?.url);
    placed = true;
    shownChannel = placeKey(tab, channel, label);
    showChannel(
      channel,
      capturing(channel, channelIds(settings.pausedChannels)),
      label,
    );
    summary = await request("run-summary", {
      run: runId,
      keys: tiles.map((tile) => tile.key),
    }).catch(() => summary);
    element("index-count").textContent =
      `${plural(summary.total, "post")} in the index`;
    render();
  } finally {
    refreshing = false;
    if (refreshAgain) {
      refreshAgain = false;
      setTimeout(() => void refresh().catch(() => {}), 400);
    }
  }
}

/**
 * Say when capture has stopped understanding Discord's markup.
 *
 * This is the failure that otherwise looks like nothing at all: no error, no
 * exception, just a count that never moves again. Discord rewrites its DOM
 * regularly, so this will eventually be true.
 */
function showHealth(health: unknown) {
  const banner = element("health");
  const broken =
    health && typeof health === "object"
      ? (health as Record<string, unknown>)
      : null;
  banner.hidden = !broken;
  if (!broken) return;
  const count = typeof broken.elements === "number" ? broken.elements : 0;
  banner.textContent = `Capture has stopped working: ${count} messages are on screen and none can be read, so Discord has changed its markup. The extension needs an update. Settings → Troubleshooting → Check this tab has the detail to report.`;
}

/** Whether this channel is being collected, as one pill that switches it. */
function showChannel(
  channel: string | null,
  enabled: boolean,
  label: ChannelLabel | null,
) {
  const chip = element<HTMLButtonElement>("toggle");
  chip.hidden = !channel;
  element("no-channel").hidden = Boolean(channel);
  chip.classList.toggle("on", enabled);
  element("channel-state").textContent = enabled ? "Capturing" : "Paused";
  // The name is truncated by CSS to fit beside the want box, so the title and
  // the accessible name carry it in full.
  const where = label ? formatChannelLabel(label) : "";
  element("channel-name").textContent = where;
  element("channel-name").hidden = !where;
  const place = where || "this channel";
  chip.setAttribute(
    "aria-label",
    enabled
      ? `Capturing ${place}. Click to pause.`
      : `Capture paused in ${place}. Click to resume.`,
  );
  chip.title = enabled
    ? `Posts in ${place} are being kept. Click to pause this channel.`
    : `Posts in ${place} are ignored while you browse. Click to resume.`;
}

action("toggle", async () => {
  const tab = await discordTab();
  const channel = channelFromUrl(tab.url);
  if (!channel) throw new Error("Open a Discord server channel first.");
  const settings = await extensionApi.storage.local.get("pausedChannels");
  const paused = channelIds(settings.pausedChannels);
  await extensionApi.storage.local.set({
    pausedChannels: paused.includes(channel)
      ? paused.filter((id: string) => id !== channel)
      : [...paused, channel],
  });
  await refresh();
});

/**
 * Talk to the content script, injecting it first if the tab has none.
 *
 * Declared content scripts only run at page load, so a Discord tab that was
 * already open when the extension was installed or updated has nothing
 * listening; the browser reports that as "Receiving end does not exist", which
 * tells the user nothing. The worker can inject it instead, so the failure is
 * only worth reporting if the retry fails too.
 */
async function toContentScript(
  tabId: number,
  message: Record<string, unknown>,
) {
  try {
    return await sendToTab(tabId, message);
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    if (
      !/Receiving end does not exist|Could not establish connection/i.test(text)
    )
      throw error;
    await request("ensure", { tabId });
    try {
      return await sendToTab(tabId, message);
    } catch {
      throw new Error(
        "The extension could not start in that Discord tab. Reload the tab (F5) and try again.",
      );
    }
  }
}

/** Searching implies capturing here; a paused channel only loses results. */
async function ensureCapturing(url: string | undefined): Promise<void> {
  const channel = channelFromUrl(url);
  if (!channel)
    throw new Error("Open your trade channel in Discord first, then search.");
  const settings = await extensionApi.storage.local.get("pausedChannels");
  const paused = channelIds(settings.pausedChannels);
  if (paused.includes(channel))
    await extensionApi.storage.local.set({
      pausedChannels: paused.filter((id: string) => id !== channel),
    });
}

const delay = element<HTMLInputElement>("delay");
const pages = element<HTMLInputElement>("pages");
const skipRecent = element<HTMLInputElement>("skip-recent");
// The same settings on the main view. Settings stays the one the run reads;
// each copy writes through to the other as it changes.
const delayMain = element<HTMLInputElement>("delay-main");
const pagesMain = element<HTMLInputElement>("pages-main");
const skipRecentMain = element<HTMLInputElement>("skip-recent-main");
const maxAge = element<HTMLSelectElement>("max-age");
/**
 * Result pages per objekt until the user picks another number. Deep by
 * default: a code searched before stops paging as soon as a page holds nothing
 * new, so the extra pages are mostly paid on a code's first search.
 */
const DEFAULT_PAGES = 10;
/**
 * Whether pace and pages follow the recommendation for the codes entered. Off
 * until "Use recommended" is pressed, so the defaults are what a search uses;
 * moving either control by hand turns it off again.
 */
let tuningAuto = false;
/**
 * Bumped when the defaults change in a way a stored, never-hand-tuned pair
 * should give way to. 2: pages default to 10 and the recommendation is no
 * longer applied unasked, so a pair it chose (6 pages for nine codes) is
 * replaced by the defaults once.
 */
const TUNING_VERSION = 2;
/** The code count the controls were last set for, so typing does not reset them. */
let tunedFor: number | null = null;

/**
 * Keep the pace slider's colour, the page-budget warning and the time
 * estimate in step with the want list, pages, pace and skip-recent together —
 * the same inputs "Search" itself plans from, via the same `planQueries`, so
 * what is shown here is what clicking it would actually do right now.
 */
function showTuning() {
  const seconds = Math.min(MAX_DELAY_S, Math.max(0, Number(delay.value) || 0));
  const pageCount = Math.min(
    20,
    Math.max(1, Number(pages.value) || DEFAULT_PAGES),
  );
  const codes = [
    ...new Set(
      searchTiles()
        .map((tile) => tile.query)
        .filter(Boolean),
    ),
  ];
  const plan = planQueries(codes, {
    searched: searchedAt,
    cooldownMs: skipRecent.checked ? DEFAULT_COOLDOWN_MS : 0,
  });
  const count = plan.queries.length;
  const rec = recommendedTuning(count);
  // Only when the codes change, and only with some entered: an empty list has
  // nothing to recommend for, and re-applying on every render would fight the
  // user the moment they touched a control.
  if (tuningAuto && count > 0 && count !== tunedFor) {
    tunedFor = count;
    if (seconds !== rec.delaySeconds || pageCount !== rec.pages) {
      delay.value = String(rec.delaySeconds);
      pages.value = String(rec.pages);
      saveSearchSettings();
      showDelay();
      return;
    }
  }
  const matches = seconds === rec.delaySeconds && pageCount === rec.pages;
  // The recommendation is offered, not applied: pages start at
  // DEFAULT_PAGES and stay wherever they are put.
  element("tuning-rec-text").textContent =
    count === 0
      ? codes.length
        ? "Every code here was searched in the last 6 hours."
        : ""
      : matches
        ? `Recommended for ${plural(count, "code")}`
        : `Recommended for ${plural(count, "code")}: ${plural(rec.pages, "page")} · +${rec.delaySeconds}s`;
  element("use-recommended").hidden = count === 0 || matches;
  // A run starts at the slower of the chosen pace and one Discord recently
  // pushed a run to, so that is what the estimate is for.
  const carried = carriedPace(storedPace, Date.now());
  const startMs = Math.max(seconds * 1000, carried);
  const load = searchLoad(count, pageCount, seconds * 1000, runStats, startMs);
  const risk = `hsl(${loadHue(load)} 80% 50%)`;
  for (const slider of [delay, delayMain]) {
    slider.style.setProperty("--risk", risk);
    slider.style.setProperty("--fill", String(seconds / MAX_DELAY_S));
  }
  // Both rows stay on screen even when empty (see the .tuning-row CSS): a row
  // that only sometimes exists is what moved the buttons below it around.
  const recent = recentRequests(requestLedger, Date.now());
  const minutes = LEDGER_WINDOW_MS / 60_000;
  element("tuning-warn").textContent = [
    load.over
      ? `${load.pages}/${load.budget} pages. Discord may rate-limit.`
      : "",
    carried > seconds * 1000
      ? `Discord pushed back recently: starts at +${Math.round(carried / 1000)}s/page.`
      : "",
    recent > 0
      ? `${recent} ${recent === 1 ? "search" : "searches"} sent in the last ${minutes} min.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  element("tuning-eta").textContent =
    load.pages > 0 && count > 0 ? describeDuration(load.estimatedMs) : "";
}

/** Zero is not "no delay applied" — it is "gated on capture instead". */
function showDelay() {
  const seconds = Math.min(MAX_DELAY_S, Math.max(0, Number(delay.value) || 0));
  delayMain.value = String(seconds);
  pagesMain.value = pages.value;
  skipRecentMain.checked = skipRecent.checked;
  element("delay-value").textContent = seconds
    ? `+${seconds}s per page`
    : "Instant";
  element("delay-main-value").textContent = seconds
    ? `+${seconds}s/page`
    : "Instant";
  showTuning();
}
delay.addEventListener("input", showDelay);
delayMain.addEventListener("input", () => {
  delay.value = delayMain.value;
  showDelay();
});
// Page depth is part of what a search looks for, so the buttons follow it too.
pagesMain.addEventListener("input", () => {
  pages.value = pagesMain.value;
  render();
});
pages.addEventListener("input", () => {
  pagesMain.value = pages.value;
  render();
});
// Registered before the save below, so the copy the run reads is already
// updated when it is written.
skipRecentMain.addEventListener("change", () => {
  skipRecent.checked = skipRecentMain.checked;
  showTuning();
});
skipRecent.addEventListener("change", () => {
  skipRecentMain.checked = skipRecent.checked;
  showTuning();
});

/** Settings take effect as they are changed, not on the next run's click. */
function saveSearchSettings() {
  void extensionApi.storage.local.set({
    searchDelay: Math.min(MAX_DELAY_S, Math.max(0, Number(delay.value) || 0)),
    searchPages: Math.min(
      20,
      Math.max(1, Number(pages.value) || DEFAULT_PAGES),
    ),
    skipRecent: skipRecent.checked,
    searchMaxAgeDays: Number(maxAge.value) || 0,
    tuningAuto,
    tuningVersion: TUNING_VERSION,
  });
}
/** A hand on pace or pages hands them over to the user. */
function tunedByHand() {
  tuningAuto = false;
  saveSearchSettings();
  showTuning();
}
for (const input of [delay, pages, delayMain, pagesMain])
  input.addEventListener("input", tunedByHand);
element("use-recommended").addEventListener("click", () => {
  tuningAuto = true;
  tunedFor = null;
  showTuning();
  saveSearchSettings();
});
maxAge.addEventListener("change", saveSearchSettings);
for (const input of [
  delay,
  pages,
  skipRecent,
  delayMain,
  pagesMain,
  skipRecentMain,
])
  input.addEventListener("change", saveSearchSettings);

action("run-search", async () => {
  if (!tiles.length) {
    wants.focus();
    throw new Error("Type what you are looking for first.");
  }
  if (!automationAllowed(consent)) {
    gateOpen = true;
    render();
    element("accept-automation").focus();
    return;
  }
  await startSearch();
});

/** Start a run for the cards on screen; the agreement is already given. */
async function startSearch() {
  if (!tiles.length) {
    wants.focus();
    throw new Error("Type what you are looking for first.");
  }
  const kept = searchTiles();
  if (!kept.length)
    throw new Error(
      "Every card is removed from this search. Restore some first.",
    );
  // A code is skipped only when every card searched by it was removed: SeoYeon
  // CC101 and Mayu CC101 are one search.
  const keptQueries = new Set(kept.map((tile) => tile.query));
  const exclude = [
    ...new Set(
      tiles
        .filter((tile) => removed.has(tile.key) && !keptQueries.has(tile.query))
        .map((tile) => tile.query),
    ),
  ];
  const tab = await discordTab();
  await ensureCapturing(tab.url);
  const seconds = Math.min(MAX_DELAY_S, Math.max(0, Number(delay.value) || 0));
  const pageCount = Math.min(
    20,
    Math.max(1, Number(pages.value) || DEFAULT_PAGES),
  );
  clearTimeout(saveTimer);
  unsaved = false;
  await extensionApi.storage.local.set({
    wants: wants.value,
    searchDelay: seconds,
    searchPages: pageCount,
    skipRecent: skipRecent.checked,
  });
  const response = await toContentScript(tab.id, {
    type: "run-search",
    wants: wants.value,
    exclude,
    delayMs: seconds * 1000,
    pages: pageCount,
    skipRecent: skipRecent.checked,
    maxAgeDays: Number(maxAge.value) || 0,
    riskAccepted: overridden(),
  });
  if (!response?.ok) throw new Error(response?.error ?? "Could not start.");
  resetOverride();
  // Recorded only once the run has started: a refused start changed nothing.
  lastFilters = searchFilters([...keptQueries].filter(Boolean), pageCount);
  await extensionApi.storage.local.set({ lastSearchFilters: lastFilters });
  heldUntil = 0;
  progress = {
    running: true,
    done: 0,
    total: response.value.total,
    at: Date.now(),
  };
  render();
}

action("continue-search", async () => {
  const tab = await discordTab();
  await ensureCapturing(tab.url);
  const response = await toContentScript(tab.id, {
    type: "continue-search",
    riskAccepted: overridden(),
  });
  if (!response?.ok) throw new Error(response?.error ?? "Could not continue.");
  resetOverride();
  heldUntil = 0;
  progress = {
    running: true,
    done: response.value.done,
    total: response.value.total,
    at: Date.now(),
  };
  render();
});

action("stop-search", async () => {
  await toContentScript((await discordTab()).id, { type: "cancel-search" });
  tell("Stopping after this page…");
});

action("open-match", async () => {
  tell(`Opening ${MATCH_LABEL}…`);
  const { posts } = await request("open-match");
  tell(`Opened in ${MATCH_LABEL} · ${plural(posts, "trade post")}`);
});

// ---------------------------------------------------------------------------
// Settings and Troubleshooting

const nickname = element<HTMLInputElement>("nickname");
const inventoryStatus = element("inventory-status");
action(
  "load-inventory",
  async () => {
    say(inventoryStatus, "Loading…");
    const count = await request("inventory", {
      nickname: nickname.value.trim(),
    });
    say(
      inventoryStatus,
      `${count} objekts saved. Posts wanting them are marked in Discord`,
    );
  },
  (message) => say(inventoryStatus, message, true),
);
nickname.addEventListener("keydown", (event) => {
  if (event.key === "Enter")
    element<HTMLButtonElement>("load-inventory").click();
});

function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * A filename that says what is in it, so a second export is not "(1)" and a
 * downloads folder full of them still says which was which.
 */
function exportName(count: number, extension: string) {
  const day = new Date().toISOString().slice(0, 10);
  return `objekt-trade-${day}-${count}-posts.${extension}`;
}

const diagnosis = element("diagnosis");
const sayDiagnosis = (message: string) => say(diagnosis, message, true);

function exportPosts(posts: Entry[], what: string) {
  if (!posts.length) throw new Error(`No ${what} to download yet.`);
  download(
    exportTranscript(posts.map((post) => post.block)),
    exportName(posts.length, "txt"),
    "text/plain;charset=utf-8",
  );
  say(diagnosis, `Downloaded ${plural(posts.length, "post")}.`);
}

action(
  "export",
  async () => {
    const posts: Entry[] = await request("dump");
    exportPosts(
      runId ? posts.filter((post) => post.run === runId) : posts,
      runId ? "posts from this search" : "captured posts",
    );
  },
  sayDiagnosis,
);
action(
  "export-all",
  async () => exportPosts(await request("dump"), "posts in the index"),
  sayDiagnosis,
);
action(
  "dump",
  async () => {
    const posts: Entry[] = await request("dump");
    download(
      JSON.stringify(posts, null, 2),
      exportName(posts.length, "json"),
      "application/json",
    );
  },
  sayDiagnosis,
);
action(
  "clear",
  async () => {
    if (!confirm("Delete all captured posts from this extension?")) return;
    await request("clear");
    await refresh();
    say(diagnosis, "Captured posts cleared.");
  },
  sayDiagnosis,
);

// Only the pop-out window needs a way back into the page; the embedded panel
// has its own titlebar.
element("dock").hidden = embedded;
action(
  "dock",
  async () => {
    const tab = await discordTab();
    await request("show-panel", { tabId: tab.id });
    await request("close-window");
  },
  sayDiagnosis,
);

/** Bytes, in a unit a person reads. */
function megabytes(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value / 1024 / 1024).toFixed(1)} MB`
    : "unknown";
}

action(
  "diagnose",
  async () => {
    const tabId = (await discordTab()).id;
    const response = await toContentScript(tabId, { type: "diagnose" });
    if (!response?.ok) throw new Error(response?.error ?? "No response.");
    const d = response.value;
    // Eviction is silent and takes the whole index with it, so "is this store
    // protected, and how full is it" belongs next to everything else that
    // explains a capture going missing.
    const storage = await request("storage").catch(() => null);
    const lines = [
      storage
        ? `storage: ${megabytes(storage.usage)} used of ${megabytes(storage.quota)}, ${storage.persisted ? "protected from eviction" : "evictable, so export regularly"}`
        : "storage: unavailable",
      // The panel and the content script are reloaded by different actions, so
      // they can disagree — and a stale content script explains almost every
      // "my fix did nothing".
      `content script build: ${d.build ?? "older than this panel, so refresh the Discord tab"}`,
      `channel: ${d.channel ?? "not on a channel"}`,
      `enabled: ${d.enabled.length ? d.enabled.join(", ") : "none"}`,
      `message elements found: ${d.elements}`,
      `readable by the parser: ${d.readable}`,
      `search box found: ${d.searchBox ? "yes" : "no"}`,
      `skipped (channel not enabled): ${JSON.stringify(d.skippedByChannel ?? {})}`,
      `results panel: ${d.results?.panel ?? "NOT FOUND"}`,
      `result rows readable in it: ${d.results?.rows ?? 0}`,
      `pager: page ${d.results?.page ?? "?"}, next ${d.results?.nextControl ? "yes" : "no"}, ${d.results?.numberedPages ?? 0} numbered`,
      `row id shapes: ${JSON.stringify(d.results?.rowShapes ?? {})}`,
      d.results?.sampleRow
        ? `one result row:\n${d.results.sampleRow}`
        : "one result row: none on screen",
      d.sampleId ? `sample id: ${d.sampleId}` : "no message elements matched",
      `probes: ${JSON.stringify(d.probes)}`,
    ];
    if (!d.elements)
      lines.push(
        "→ Discord's message markup changed; the selector needs updating.",
      );
    else if (!d.readable)
      lines.push(
        "→ Elements found but unreadable; the author/time anchors moved.",
      );
    else if (d.channel && !d.enabled.includes(d.channel))
      lines.push("→ Readable, but capture is off for this channel.");
    if (!d.results?.panel)
      lines.push(
        "→ No search results panel found. Run a search first; if one is open, the row id shapes above say what its markup became.",
      );
    say(diagnosis, lines.join("\n"));
  },
  sayDiagnosis,
);

// ---------------------------------------------------------------------------
// Start-up and live updates

/**
 * Follow Discord's theme, not the operating system's.
 *
 * The panel sits inside Discord, where a light panel on a dark page (or the
 * reverse) reads as broken, and Discord's choice is its own setting.
 */
function applyTheme(theme: unknown) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}

const manifest = extensionApi.runtime.getManifest();
element("build").textContent = manifest.version_name ?? manifest.version;

void extensionApi.storage.local
  .get([
    "consent",
    "discordTheme",
    "wants",
    "searchDelay",
    "searchPages",
    "skipRecent",
    "searchMaxAgeDays",
    "tuningAuto",
    "tuningVersion",
    "owned",
    "nickname",
    "removedWants",
    "huntAt",
    "wantsBeforeHunt",
  ])
  .then((settings) => {
    removed = readRemoved(settings.removedWants);
    readHuntState(settings);
    consent = settings.consent;
    applyTheme(settings.discordTheme);
    showViews();
    if (typeof settings.wants === "string" && !wants.value)
      wants.value = settings.wants;
    // Pace and pages someone set themselves are kept. A pair the old
    // always-on recommendation picked is not a choice, and gives way to the
    // current defaults once (see TUNING_VERSION).
    const tunedHere =
      settings.tuningVersion === TUNING_VERSION ||
      settings.tuningAuto === false;
    if (tunedHere && typeof settings.searchDelay === "number")
      delay.value = String(settings.searchDelay);
    if (tunedHere && typeof settings.searchPages === "number")
      pages.value = String(settings.searchPages);
    if (typeof settings.skipRecent === "boolean")
      skipRecent.checked = settings.skipRecent;
    if (typeof settings.searchMaxAgeDays === "number")
      maxAge.value = String(settings.searchMaxAgeDays);
    if (tunedHere && typeof settings.tuningAuto === "boolean")
      tuningAuto = settings.tuningAuto;
    if (!tunedHere) saveSearchSettings();
    showDelay();
    nickname.value =
      typeof settings.nickname === "string" ? settings.nickname : "";
    const owned = Array.isArray(settings.owned) ? settings.owned.length : 0;
    if (owned) say(inventoryStatus, `${owned} objekts saved`);
    wantsChanged(false);
    return refresh();
  })
  .catch((error) =>
    tell(error instanceof Error ? error.message : String(error), true),
  );

extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  // Another copy of this panel may have agreed, or withdrawn.
  if (changes.consent) {
    consent = changes.consent.newValue;
    if (!captureAllowed(consent)) settingsOpen = false;
    showViews();
  }
  if (changes.discordTheme) applyTheme(changes.discordTheme.newValue);
  // Another copy of the panel removed or restored a card.
  if (changes.removedWants) {
    removed = readRemoved(changes.removedWants.newValue);
    showWantsCount();
    render();
  }
  // Another copy of the panel started a search.
  if (changes.lastSearchFilters) {
    lastFilters = readFilters(changes.lastSearchFilters.newValue);
    render();
  }
  if (changes.runStats) {
    runStats = readRunStats(changes.runStats.newValue);
    showTuning();
  }
  if (changes.searchPace || changes.searchLedger) {
    if (changes.searchPace) storedPace = changes.searchPace.newValue;
    if (changes.searchLedger)
      requestLedger = readLedger(changes.searchLedger.newValue);
    showTuning();
  }
  if (changes.rateLimitedAt) {
    rateLimitedAt = readRateLimitedAt(changes.rateLimitedAt.newValue);
    // A new stall needs its own acknowledgement.
    resetOverride();
    render();
  }
  // Keep the cards moving with the run without waiting on a full refresh.
  if (changes.searchProgress || changes.pendingRun) {
    if (changes.searchProgress)
      progress = asRecord(changes.searchProgress.newValue);
    if (changes.pendingRun)
      pending = readPendingRun(changes.pendingRun.newValue);
    render();
  }
  // A hunt from objekt.my replaces the list even mid-edit: it was sent on
  // purpose, and Undo puts back whatever it replaced.
  if (changes.huntAt || changes.wantsBeforeHunt) {
    readHuntState({
      ...(changes.huntAt ? { huntAt: changes.huntAt.newValue } : {}),
      ...(changes.wantsBeforeHunt
        ? { wantsBeforeHunt: changes.wantsBeforeHunt.newValue }
        : {}),
    });
    showHunt();
  }
  if (
    changes.wants &&
    (document.activeElement !== wants || changes.huntId) &&
    typeof changes.wants.newValue === "string" &&
    changes.wants.newValue !== wants.value
  ) {
    wants.value = changes.wants.newValue;
    wantsChanged(false);
  }
  // The bridge fills in a nickname only when there was none.
  if (
    changes.nickname &&
    document.activeElement !== nickname &&
    typeof changes.nickname.newValue === "string"
  )
    nickname.value = changes.nickname.newValue;
  if (changes.owned && Array.isArray(changes.owned.newValue))
    say(inventoryStatus, `${changes.owned.newValue.length} objekts saved`);
  void refresh().catch(() => {});
});

// Switching channels in Discord is a pushState: it writes nothing to storage,
// so nothing above notices, and the chip went on naming — and toggling the
// capture state of — the channel you had just left. A tab lookup every couple
// of seconds while this panel is on screen is cheap; the full refresh only runs
// when the channel or its name has actually changed. The key uses the parsed
// label, not the raw title, so Discord's unread counter ticking over in the
// title does not count as a change.
setInterval(() => {
  if (document.visibilityState !== "visible" || refreshing) return;
  void discordTab()
    .catch(() => null)
    .then((tab) => {
      const channel = channelFromUrl(tab?.url);
      const label = channel ? channelLabelFromTitle(tab?.title) : null;
      if (placeKey(tab, channel, label) !== shownChannel)
        void refresh().catch(() => {});
    });
}, 2_000);

element("cooldown-open").addEventListener("click", () => {
  if (warningOpenedAt === null) warningOpenedAt = Date.now();
  else resetOverride();
  render();
});
element<HTMLInputElement>("cooldown-ack").addEventListener(
  "change",
  (event) => {
    overrideFor = (event.currentTarget as HTMLInputElement).checked
      ? rateLimitedAt
      : null;
    render();
  },
);

// Tick the cool-down's countdown, and hand the buttons back when it ends.
// And the search's stopwatch, while one is going.
setInterval(() => {
  if (document.visibilityState !== "visible") return;
  if (rateLimitedAt === null) {
    if (running()) render();
    return;
  }
  render();
  if (lockoutRemaining(rateLimitedAt, Date.now()) === 0) rateLimitedAt = null;
}, 1_000);

// A stale run is only noticed when something looks at it; nothing writes to
// storage once its tab has gone, so look now and then.
setInterval(() => {
  if (progress?.running === true) render();
}, 15_000);
