import { parseOffering } from "@/lib/discord/match";
import { extensionApi } from "./browser";
import {
  acceptAutomation,
  acceptCapture,
  automationAllowed,
  captureAllowed,
} from "./consent";
import { exportTranscript } from "./export";
import { DISCORD_MATCHES, resolveTab, type TabLike } from "./host-tab";
import { channelFromUrl, channelIds } from "./settings";
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
/** The tab an embedded panel is sitting in, which is the tab it acts on. */
const pinnedTab = Number.isFinite(Number(params.get("tab")))
  ? Number(params.get("tab"))
  : null;

const tabs: {
  get: (id: number) => Promise<TabLike | undefined>;
  query: () => Promise<TabLike[]>;
} = {
  get: (id) => extensionApi.tabs.get(id),
  query: () => extensionApi.tabs.query({ url: DISCORD_MATCHES }),
};

/** The Discord tab this panel acts on. Throws with something readable if none. */
function discordTab() {
  return resolveTab(tabs, pinnedTab);
}

const status = document.getElementById("status") as HTMLElement;
async function request(type: string, extra: Record<string, unknown> = {}) {
  const response = await extensionApi.runtime.sendMessage({ type, ...extra });
  if (!response?.ok)
    throw new Error(response?.error ?? "Extension unavailable");
  return response.value;
}
/**
 * Wire a button, and make it obvious that it is doing something.
 *
 * Every one of these round-trips to the worker or to a tab, so "did my click
 * land" is a real question — and a second click while the first is in flight
 * is how two inventory lookups or two exports happen.
 */
function action(
  id: string,
  run: () => Promise<void>,
  say: (message: string, bad: boolean) => void = (message) => {
    status.textContent = message;
    status.classList.add("bad");
  },
) {
  const button = document.getElementById(id);
  if (!(button instanceof HTMLButtonElement)) return;
  let busy = false;
  button.addEventListener("click", () => {
    if (busy) return;
    busy = true;
    const label = button.textContent;
    button.disabled = true;
    void run()
      .catch((error) => {
        say(error instanceof Error ? error.message : String(error), true);
      })
      .finally(() => {
        busy = false;
        // A button whose state something longer-lived now owns is left alone.
        // Starting a run finishes this handler in a few hundred milliseconds
        // while the run itself goes on for minutes, and re-enabling the Search
        // button there would offer a second run on top of the first.
        if (button.dataset.hold === "1") return;
        button.disabled = false;
        if (label !== null) button.textContent = label;
      });
  });
}

/** Say something in a region, and colour it by whether it went wrong. */
function say(element: HTMLElement, message: string, bad = false) {
  element.textContent = message;
  element.classList.toggle("bad", bad);
}
/**
 * Show only what the user has agreed to.
 *
 * Both stores require the disclosure to be in the extension's own UI and to be
 * agreed to before anything is collected, so the rest of the interface stays
 * out of the way until it is — a paused-looking capture panel above an
 * un-read disclosure is exactly the "surprise" the policies are about.
 */
function showSections(consent: unknown) {
  const capture = captureAllowed(consent);
  const automation = automationAllowed(consent);
  const show = (id: string, on: boolean) => {
    const element = document.getElementById(id);
    if (element) element.hidden = !on;
  };
  show("consent", !capture);
  for (const id of [
    "channel-bar",
    "step-inventory",
    "step-wants",
    "step-match",
    "step-trouble",
  ])
    show(id, capture);
  show("automation-gate", capture && !automation);
  show("search-section", capture && automation);
}

async function readConsentSetting(): Promise<unknown> {
  const { consent } = await extensionApi.storage.local.get("consent");
  return consent;
}

action("accept-capture", async () => {
  const consent = acceptCapture(await readConsentSetting());
  await extensionApi.storage.local.set({ consent });
  showSections(consent);
  await refresh();
});

action("accept-automation", async () => {
  const consent = acceptAutomation(await readConsentSetting());
  await extensionApi.storage.local.set({ consent });
  showSections(consent);
});

action("withdraw", async () => {
  if (
    !confirm(
      "Stop reading Discord and forget your agreement? Posts already captured are kept — clear them separately if you want them gone.",
    )
  )
    return;
  await extensionApi.storage.local.remove("consent");
  showSections(undefined);
});

/** The search whose posts the export is scoped to, or null before any search. */
async function currentRun(): Promise<string | null> {
  const { searchRunId } = await extensionApi.storage.local.get("searchRunId");
  return typeof searchRunId === "string" && searchRunId ? searchRunId : null;
}

async function refresh() {
  const settings = await extensionApi.storage.local.get([
    "captureError",
    "captureHealth",
    "channels",
  ]);
  const tab = await discordTab().catch(() => null);
  const channel = channelFromUrl(tab?.url);
  const enabled = Boolean(
    channel && channelIds(settings.channels).includes(channel),
  );
  showHealth(settings.captureHealth);
  if (typeof settings.captureError === "string") {
    say(status, settings.captureError, true);
    return;
  }
  const captured = Number(await request("count"));
  const run = await currentRun();
  const fromRun = run ? Number(await request("count", { run })) : 0;
  // The index is cumulative — channel browsing and every earlier search — so
  // the two numbers are different questions and both are worth saying.
  const parts = [
    run
      ? `${fromRun} post${fromRun === 1 ? "" : "s"} from this search ready to export (${captured} in the index).`
      : captured
        ? `${captured} post${captured === 1 ? "" : "s"} ready to export.`
        : "Nothing captured yet — run a search above.",
  ];
  // The channel strip says whether this channel is being collected, so the
  // status does not repeat it.
  if (!channel) parts.push("Open a Discord trade channel to capture.");
  say(status, parts.join(" "));
  showChannel(tab?.url, enabled);
}

/**
 * Say when capture has stopped understanding Discord's markup.
 *
 * This is the failure that otherwise looks like nothing at all: no error, no
 * exception, just a badge that never moves again. Discord rewrites its DOM
 * regularly, so this will eventually be true, and a user who is told can stop
 * relying on the extension and report it.
 */
function showHealth(health: unknown) {
  const banner = document.getElementById("health");
  if (!banner) return;
  const broken =
    health && typeof health === "object"
      ? (health as Record<string, unknown>)
      : null;
  banner.hidden = !broken;
  if (!broken) return;
  const elements = typeof broken.elements === "number" ? broken.elements : 0;
  banner.textContent = `Capture has stopped working: ${elements} messages are on screen and none of them can be read, which means Discord has changed its markup. The extension needs an update — Troubleshooting → Check this tab has the detail to report.`;
}

/**
 * The channel strip: which Discord channel this panel is pointed at, and
 * whether its posts are being kept.
 *
 * This switch used to live in Troubleshooting, which is the wrong place for
 * the control that decides whether the extension does anything at all.
 */
function showChannel(url: string | undefined, enabled: boolean) {
  const bar = document.getElementById("channel-bar");
  const state = document.getElementById("channel-state");
  const pip = document.getElementById("channel-pip");
  const button = document.getElementById("toggle");
  if (!bar || !state || !pip || !(button instanceof HTMLButtonElement)) return;
  const channel = channelFromUrl(url);
  pip.classList.toggle("on", enabled);
  button.hidden = !channel;
  if (!channel) {
    state.textContent = url
      ? "Open a server channel in Discord — this is not one."
      : "No Discord tab open.";
    return;
  }
  state.innerHTML = "";
  const label = document.createElement("strong");
  label.textContent = enabled ? "Capturing" : "Not capturing";
  state.append(label, ` this channel${enabled ? "" : " — posts are ignored"}`);
  button.textContent = enabled ? "Pause here" : "Capture here";
}
function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
action("toggle", async () => {
  const tab = await discordTab();
  const channel = channelFromUrl(tab.url);
  if (!channel) throw new Error("Open a Discord server trade channel first.");
  const settings = await extensionApi.storage.local.get("channels");
  const channels = channelIds(settings.channels);
  const enabled = channels.includes(channel);
  await extensionApi.storage.local.set({
    channels: enabled
      ? channels.filter((id: string) => id !== channel)
      : [...channels, channel],
  });
  say(
    status,
    enabled
      ? "Capture paused for this channel."
      : "Capture enabled. Browse the channel to collect posts.",
  );
  await refresh();
});
action("dump", async () => {
  download(
    JSON.stringify(await request("dump"), null, 2),
    "objekt-discord-index.json",
    "application/json",
  );
});
action("clear", async () => {
  if (confirm("Delete all captured posts from this extension?")) {
    await request("clear");
    await refresh();
  }
});
void readConsentSetting().then(showSections);
void refresh().catch((error) => {
  status.textContent = error.message;
});

/** Export `posts`, or say why there was nothing to write. */
function exportPosts(posts: Entry[], what: string) {
  if (!posts.length) {
    say(status, `No ${what} to export yet.`, true);
    return;
  }
  download(
    exportTranscript(posts.map((post) => post.block)),
    "objekt-discord-transcript.txt",
    "text/plain;charset=utf-8",
  );
  say(
    status,
    `Downloaded ${posts.length} ${what}. Open /match and choose Import text files.`,
  );
}

action("export", async () => {
  const posts: Entry[] = await request("dump");
  const run = await currentRun();
  // Scoped to the last search: matching against a whole cumulative index pulls
  // in channel browsing and stale posts from earlier searches, which is not
  // what was asked for.
  exportPosts(
    run ? posts.filter((post) => post.run === run) : posts,
    run ? "posts from this search" : "captured posts",
  );
});

action("export-all", async () => {
  const posts: Entry[] = await request("dump");
  exportPosts(posts, "posts in the index");
});

const inventoryStatus = document.getElementById(
  "inventory-status",
) as HTMLElement;
const nickname = document.getElementById("nickname") as HTMLInputElement;
const haves = document.getElementById("haves") as HTMLTextAreaElement;
const sayInventory = (message: string, bad: boolean) =>
  say(inventoryStatus, message, bad);
action(
  "save-haves",
  async () => {
    const owned = parseOffering(haves.value).map(
      ({ member, season, collectionNo }) => ({ member, season, collectionNo }),
    );
    if (haves.value.trim() && !owned.length)
      throw new Error("No objekts recognized. Try YooYeon CC101.");
    await extensionApi.storage.local.set({
      owned,
      nickname: "",
      haves: haves.value,
    });
    say(inventoryStatus, `${owned.length} typed haves saved`);
  },
  sayInventory,
);
action(
  "load-inventory",
  async () => {
    // A permission prompt has to come from a user gesture in an extension
    // document. That holds here, but a panel embedded in a page is an unusual
    // enough place for one that browsers have refused it outright before — so a
    // throw is treated as "ask somewhere else", not as a failure.
    let allowed: boolean;
    try {
      allowed = await extensionApi.permissions.request({
        origins: ["https://objekt.my/*"],
      });
    } catch {
      if (!embedded)
        throw new Error("The permission prompt could not be shown.");
      await request("open-window");
      throw new Error(
        "This browser will not show the permission prompt inside the page. Use the window that just opened, or type your haves instead.",
      );
    }
    if (!allowed)
      throw new Error(
        "Allow access to objekt.my to load inventory, or type your haves.",
      );
    say(inventoryStatus, "Loading inventory…");
    try {
      const count = await request("inventory", {
        nickname: nickname.value.trim(),
      });
      say(inventoryStatus, `${count} transferable objekts saved`);
    } catch (error) {
      say(inventoryStatus, "Lookup failed; saved haves kept.", true);
      throw error;
    }
  },
  sayInventory,
);
void extensionApi.storage.local
  .get(["owned", "nickname", "haves"])
  .then((settings) => {
    inventoryStatus.textContent = `${Array.isArray(settings.owned) ? settings.owned.length : 0} saved haves`;
    nickname.value =
      typeof settings.nickname === "string" ? settings.nickname : "";
    haves.value = typeof settings.haves === "string" ? settings.haves : "";
  });

// Only the pop-out window needs a way back into the page; the embedded panel
// has the pop-out button in its own titlebar.
const dock = document.getElementById("dock");
if (dock) dock.hidden = embedded;
document.body.classList.toggle("embedded", embedded);
action("dock", async () => {
  const tab = await discordTab();
  await request("show-panel", { tabId: tab.id });
  await request("close-window");
});

/**
 * Count what the parser will actually recognise, as it is typed.
 *
 * A list is only as good as what comes out of the parser, and the two differ
 * far more often than people expect — a stray heading or a format the parser
 * does not know reads as nothing at all. Saying so at the point of typing beats
 * finding out after a run returns nothing.
 */
function countCodes(
  field: HTMLTextAreaElement,
  into: HTMLElement,
  noun: string,
) {
  const show = () => {
    const text = field.value.trim();
    if (!text) {
      say(into, "");
      into.classList.remove("none");
      return;
    }
    const found = parseOffering(field.value).length;
    const lines = text.split("\n").filter((line) => line.trim()).length;
    into.classList.toggle("none", found === 0);
    // Saying which lines did not land matters more than the total: a list where
    // half the lines are section headings parses to half a list, silently.
    into.textContent = found
      ? found < lines
        ? `${found} ${noun}${found === 1 ? "" : "s"} from ${lines} lines — the rest were not recognised`
        : `${found} ${noun}${found === 1 ? "" : "s"} recognised`
      : "Nothing recognised yet — try “YooYeon CC101”";
  };
  field.addEventListener("input", show);
  show();
}

/**
 * Follow Discord's theme, not the operating system's.
 *
 * The panel sits inside Discord, where a light theme next to a dark page (or
 * the reverse) reads as broken. Discord's choice is its own setting, so the
 * content script reports it and this follows.
 */
function applyTheme(theme: unknown) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}
void extensionApi.storage.local
  .get("discordTheme")
  .then((settings) => applyTheme(settings.discordTheme));

const build = document.getElementById("build") as HTMLElement;
const manifest = extensionApi.runtime.getManifest();
build.textContent = manifest.version_name ?? manifest.version;

const wants = document.getElementById("wants") as HTMLTextAreaElement;
countCodes(
  haves,
  document.getElementById("haves-count") as HTMLElement,
  "objekt",
);
countCodes(
  wants,
  document.getElementById("wants-count") as HTMLElement,
  "objekt",
);
const delay = document.getElementById("delay") as HTMLInputElement;
const pages = document.getElementById("pages") as HTMLInputElement;
const skipRecent = document.getElementById("skip-recent") as HTMLInputElement;
const delayValue = document.getElementById("delay-value") as HTMLElement;
const searchStatus = document.getElementById("search-status") as HTMLElement;
const searchTotal = document.getElementById("search-total") as HTMLElement;

/** Zero is not "no delay applied" — it is "gated on capture instead". */
function showDelay() {
  const seconds = Math.min(15, Math.max(0, Number(delay.value) || 0));
  delayValue.textContent = seconds ? `+${seconds}s per page` : "Fastest";
}
delay.addEventListener("input", showDelay);

/**
 * Talk to the content script, injecting it first if the tab has none.
 *
 * Declared content scripts only run at page load, so a Discord tab that was
 * already open when the extension was installed or updated has nothing
 * listening; the browser reports that as "Receiving end does not exist", which
 * tells the user nothing. The old answer was to tell them to press F5. The
 * worker can simply inject it instead, so the failure is only worth reporting
 * if the retry fails too.
 */
async function toContentScript(
  tabId: number,
  message: Record<string, unknown>,
) {
  try {
    return await extensionApi.tabs.sendMessage(tabId, message);
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    if (
      !/Receiving end does not exist|Could not establish connection/i.test(text)
    )
      throw error;
    await request("ensure", { tabId });
    try {
      return await extensionApi.tabs.sendMessage(tabId, message);
    } catch {
      throw new Error(
        "The extension could not start in that Discord tab. Reload the tab (F5) and try again.",
      );
    }
  }
}

async function activeDiscordTab() {
  return (await discordTab()).id;
}

/**
 * How long a run may go without reporting before it is presumed dead.
 *
 * A page settles in fifteen seconds at the outside and reports on every page,
 * so a minute of silence is not a slow run — it is a tab that navigated away
 * mid-run and took the content script with it.
 */
const STALE_MS = 60_000;

function describe(progress: unknown): string {
  if (!progress || typeof progress !== "object") return "";
  const p = progress as Record<string, unknown>;
  const done = typeof p.done === "number" ? p.done : 0;
  const total = typeof p.total === "number" ? p.total : 0;
  const planNote =
    typeof p.planNote === "string" && p.planNote ? `\n${p.planNote}` : "";
  if (p.running) {
    const at = typeof p.at === "number" ? p.at : 0;
    if (at && Date.now() - at > STALE_MS)
      return `Stopped reporting after ${done}/${total}. The Discord tab was probably reloaded or closed — anything captured is still in the index.`;
    return `Searching ${done}/${total}${p.query ? ` · ${p.query}` : ""}${
      typeof p.page === "number" ? ` · page ${p.page}` : ""
    }…${planNote}`;
  }
  const pages =
    typeof p.pagesWalked === "number" ? ` · ${p.pagesWalked} pages walked` : "";
  // Worth showing even on a clean run: retries mean Discord's search bar is
  // misfiring, which is the difference between "slow" and "quietly broken".
  const retries =
    typeof p.retried === "number" && p.retried > 0
      ? ` · ${p.retried} ${p.retried === 1 ? "retry" : "retries"}`
      : "";
  // A code nobody has posted is a normal answer, and saying so stops it looking
  // like the run went wrong.
  const empty =
    typeof p.empty === "number" && p.empty > 0
      ? ` · ${p.empty} with no matches`
      : "";
  // A panel closed under the run is a thing the user did, and the fix is
  // something only they can do.
  const closed =
    typeof p.closed === "number" && p.closed > 0
      ? ` · ${p.closed} cut short by the results closing`
      : "";
  // Chrome and Firefox accept different insertions; which one carried the run
  // is the first thing worth knowing when one browser misbehaves.
  const typed =
    p.typedBy && typeof p.typedBy === "object"
      ? Object.entries(p.typedBy as Record<string, number>)
          .map(([name, count]) => `${name}×${count}`)
          .join(", ")
      : "";
  // A pager that refuses to advance looks identical to one that worked, and so
  // does a page abandoned before its posts were recorded, so say which happened
  // rather than leaving it to be inferred from result counts.
  const note = ["pagerNote", "settleNote"]
    .map((key) => p[key])
    .filter((text): text is string => typeof text === "string" && text !== "")
    .map((text) => `\n⚠ ${text}`)
    .join("");
  if (typeof p.stopped === "string" && p.stopped)
    return `Stopped after ${done}/${total}: ${p.stopped}${planNote}${note}`;
  return total
    ? `Finished ${done}/${total} searches${pages}${retries}${empty}${closed}.${
        typed ? `\ntyped via ${typed}` : ""
      }${planNote}${note}`
    : "";
}

/** The running total, which accumulates through a run and restarts with the next. */
function tally(progress: unknown): void {
  const posts =
    progress && typeof progress === "object"
      ? (progress as Record<string, unknown>).posts
      : 0;
  searchTotal.textContent = String(typeof posts === "number" ? posts : 0);
}

async function refreshSearch() {
  const settings = await extensionApi.storage.local.get([
    "searchProgress",
    "wants",
    "searchDelay",
    "searchPages",
    "skipRecent",
  ]);
  if (typeof settings.wants === "string" && !wants.value)
    wants.value = settings.wants;
  if (typeof settings.searchDelay === "number")
    delay.value = String(settings.searchDelay);
  if (typeof settings.searchPages === "number")
    pages.value = String(settings.searchPages);
  if (typeof settings.skipRecent === "boolean")
    skipRecent.checked = settings.skipRecent;
  showDelay();
  say(searchStatus, describe(settings.searchProgress));
  tally(settings.searchProgress);
  progressBar(settings.searchProgress);
}

/** Keep the bar and the buttons in step with whatever the run last reported. */
function progressBar(progress: unknown) {
  if (!progress || typeof progress !== "object")
    return showRunning(false, 0, 0);
  const p = progress as Record<string, unknown>;
  const at = typeof p.at === "number" ? p.at : 0;
  // A run whose reports have stopped is not a run any more, whatever the flag
  // says: it went away with its tab.
  const running = p.running === true && (!at || Date.now() - at <= STALE_MS);
  showRunning(
    running,
    typeof p.done === "number" ? p.done : 0,
    typeof p.total === "number" ? p.total : 0,
  );
}

/** Searching implies capturing here; a separate toggle only loses results. */
async function ensureCapturing(url: string | undefined): Promise<string> {
  const channel = channelFromUrl(url);
  if (!channel)
    throw new Error("Open your trade channel in Discord first, then run.");
  const settings = await extensionApi.storage.local.get("channels");
  const channels = channelIds(settings.channels);
  if (!channels.includes(channel))
    await extensionApi.storage.local.set({ channels: [...channels, channel] });
  return channel;
}

const saySearch = (message: string, bad: boolean) =>
  say(searchStatus, message, bad);
action(
  "run-search",
  async () => {
    const tab = await discordTab();
    await ensureCapturing(tab.url);
    const tabId = tab.id;
    const seconds = Math.min(15, Math.max(0, Number(delay.value) || 0));
    const pageCount = Math.min(20, Math.max(1, Number(pages.value) || 3));
    await extensionApi.storage.local.set({
      wants: wants.value,
      searchDelay: seconds,
      searchPages: pageCount,
      skipRecent: skipRecent.checked,
    });
    const response = await toContentScript(tabId, {
      type: "run-search",
      wants: wants.value,
      delayMs: seconds * 1000,
      pages: pageCount,
      skipRecent: skipRecent.checked,
    });
    if (!response?.ok) throw new Error(response?.error ?? "Could not start.");
    const note = response.value.note ? `\n${response.value.note}` : "";
    say(
      searchStatus,
      `Searching 0/${response.value.total}… the panel can be moved or closed while it runs.${note}`,
    );
    searchTotal.textContent = "0";
    showRunning(true, 0, response.value.total);
    void refresh();
  },
  saySearch,
);

action(
  "stop-search",
  async () => {
    await toContentScript(await activeDiscordTab(), { type: "cancel-search" });
    say(searchStatus, "Stopping after the current page…");
  },
  saySearch,
);

/**
 * Show a run as a run: a progress bar, and a Stop button that is only there
 * when there is something to stop.
 */
function showRunning(running: boolean, done: number, total: number) {
  const bar = document.getElementById("search-progress");
  const stop = document.getElementById("stop-search");
  const start = document.getElementById("run-search");
  if (bar instanceof HTMLProgressElement) {
    bar.hidden = !running;
    bar.max = Math.max(1, total);
    bar.value = Math.min(done, Math.max(1, total));
  }
  if (stop) stop.hidden = !running;
  if (start instanceof HTMLButtonElement) {
    // Claimed for as long as the run lasts, so the click handler that started
    // it does not hand the button back when it returns.
    start.dataset.hold = running ? "1" : "";
    start.disabled = running;
    start.textContent = running ? "Searching…" : "Search my wants";
  }
}

extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  // Another window of this panel may have agreed, or withdrawn.
  if (changes.consent) showSections(changes.consent.newValue);
  if (changes.discordTheme) applyTheme(changes.discordTheme.newValue);
  if (changes.captureHealth) showHealth(changes.captureHealth.newValue);
  if (changes.searchProgress) {
    say(searchStatus, describe(changes.searchProgress.newValue));
    tally(changes.searchProgress.newValue);
    progressBar(changes.searchProgress.newValue);
  }
  // The captured count moves as results render, so keep step 4 current.
  void refresh().catch(() => {});
});

void refreshSearch().catch((error) => {
  searchStatus.textContent = error.message;
});

/** Bytes, in a unit a person reads. */
function megabytes(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value / 1024 / 1024).toFixed(1)} MB`
    : "unknown";
}

action(
  "diagnose",
  async () => {
    const tabId = await activeDiscordTab();
    const response = await toContentScript(tabId, { type: "diagnose" });
    if (!response?.ok) throw new Error(response?.error ?? "No response.");
    const d = response.value;
    // Eviction is silent and takes the whole index with it, so "is this store
    // protected, and how full is it" belongs next to everything else that
    // explains a capture going missing.
    const storage = await request("storage").catch(() => null);
    const lines = [
      storage
        ? `storage: ${megabytes(storage.usage)} used of ${megabytes(storage.quota)}, ${storage.persisted ? "protected from eviction" : "evictable — export regularly"}`
        : "storage: unavailable",
      // The popup and the content script are reloaded by different actions, so
      // they can disagree — and a stale content script explains almost every
      // "my fix did nothing".
      `content script build: ${d.build ?? "older than this popup — refresh the Discord tab"}`,
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
      lines.push("→ Readable, but this channel is paused. Click Enable above.");
    // Run this with a search open: no panel means every "page walked" was walked
    // against the channel list behind it.
    if (!d.results?.panel)
      lines.push(
        "→ No search results panel found. Run a search first; if one is open, the row id shapes above say what its markup became.",
      );
    say(searchStatus, lines.join("\n"));
  },
  saySearch,
);
