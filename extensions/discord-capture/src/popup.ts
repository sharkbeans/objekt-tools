import { parseOffering } from "@/lib/discord/match";
import { extensionApi } from "./browser";
import { exportTranscript } from "./export";
import { channelFromUrl, channelIds, isDiscordUrl } from "./settings";
import type { Entry } from "./store";

const status = document.getElementById("status") as HTMLElement;
async function request(type: string, extra: Record<string, unknown> = {}) {
  const response = await extensionApi.runtime.sendMessage({ type, ...extra });
  if (!response?.ok)
    throw new Error(response?.error ?? "Extension unavailable");
  return response.value;
}
function action(id: string, run: () => Promise<void>) {
  document.getElementById(id)?.addEventListener("click", () => {
    void run().catch((error) => {
      status.textContent = error.message;
    });
  });
}
/** The search whose posts the export is scoped to, or null before any search. */
async function currentRun(): Promise<string | null> {
  const { searchRunId } = await extensionApi.storage.local.get("searchRunId");
  return typeof searchRunId === "string" && searchRunId ? searchRunId : null;
}

async function refresh() {
  const settings = await extensionApi.storage.local.get([
    "captureError",
    "channels",
  ]);
  const [tab] = await extensionApi.tabs.query({
    active: true,
    currentWindow: true,
  });
  const channel = channelFromUrl(tab?.url);
  const enabled = Boolean(
    channel && channelIds(settings.channels).includes(channel),
  );
  if (typeof settings.captureError === "string") {
    status.textContent = settings.captureError;
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
  // Only worth mentioning when it explains why nothing is arriving.
  if (channel && !enabled && captured === 0)
    parts.push(
      "Capture is paused for this channel; running a search enables it.",
    );
  if (!channel) parts.push("Open a Discord trade channel to capture.");
  status.textContent = parts.join(" ");
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
  const [tab] = await extensionApi.tabs.query({
    active: true,
    currentWindow: true,
  });
  const channel = channelFromUrl(tab?.url);
  if (!channel) throw new Error("Open a Discord server trade channel first.");
  const settings = await extensionApi.storage.local.get("channels");
  const channels = channelIds(settings.channels);
  const enabled = channels.includes(channel);
  await extensionApi.storage.local.set({
    channels: enabled
      ? channels.filter((id: string) => id !== channel)
      : [...channels, channel],
  });
  status.textContent = enabled
    ? "Capture paused for this channel."
    : "Capture enabled. Browse the channel to collect posts.";
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
void refresh().catch((error) => {
  status.textContent = error.message;
});

/** Export `posts`, or say why there was nothing to write. */
function exportPosts(posts: Entry[], what: string) {
  if (!posts.length) {
    status.textContent = `No ${what} to export yet.`;
    return;
  }
  download(
    exportTranscript(posts.map((post) => post.block)),
    "objekt-discord-transcript.txt",
    "text/plain;charset=utf-8",
  );
  status.textContent = `Downloaded ${posts.length} ${what}. Open /match and choose Import text files.`;
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
action("save-haves", async () => {
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
  inventoryStatus.textContent = `${owned.length} typed haves saved`;
});
action("load-inventory", async () => {
  const allowed = await extensionApi.permissions.request({
    origins: ["https://objekt.my/*"],
  });
  if (!allowed)
    throw new Error(
      "Allow access to objekt.my to load inventory, or type your haves.",
    );
  inventoryStatus.textContent = "Loading inventory…";
  try {
    const count = await request("inventory", {
      nickname: nickname.value.trim(),
    });
    inventoryStatus.textContent = `${count} transferable objekts saved`;
  } catch (error) {
    inventoryStatus.textContent = "Lookup failed; saved haves kept.";
    throw error;
  }
});
void extensionApi.storage.local
  .get(["owned", "nickname", "haves"])
  .then((settings) => {
    inventoryStatus.textContent = `${Array.isArray(settings.owned) ? settings.owned.length : 0} saved haves`;
    nickname.value =
      typeof settings.nickname === "string" ? settings.nickname : "";
    haves.value = typeof settings.haves === "string" ? settings.haves : "";
  });

const build = document.getElementById("build") as HTMLElement;
const manifest = extensionApi.runtime.getManifest();
build.textContent = manifest.version_name ?? manifest.version;

const wants = document.getElementById("wants") as HTMLTextAreaElement;
const delay = document.getElementById("delay") as HTMLInputElement;
const pages = document.getElementById("pages") as HTMLInputElement;
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
 * Talk to the content script, translating the one failure users actually hit.
 *
 * Content scripts are injected at page load, so a Discord tab opened before the
 * extension was installed or reloaded has nothing listening — Chrome reports
 * that as "Receiving end does not exist", which tells the user nothing.
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
      /Receiving end does not exist|Could not establish connection/i.test(text)
    )
      throw new Error(
        "The extension is not running in that tab yet. Reload the Discord tab (F5) and try again.",
      );
    throw error;
  }
}

async function activeDiscordTab() {
  const [tab] = await extensionApi.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id || !isDiscordUrl(tab.url))
    throw new Error("Open the Discord tab with your trade channel first.");
  return tab.id;
}

function describe(progress: unknown): string {
  if (!progress || typeof progress !== "object") return "";
  const p = progress as Record<string, unknown>;
  const done = typeof p.done === "number" ? p.done : 0;
  const total = typeof p.total === "number" ? p.total : 0;
  if (p.running)
    return `Searching ${done}/${total}${p.query ? ` · ${p.query}` : ""}${
      typeof p.page === "number" ? ` · page ${p.page}` : ""
    }…`;
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
    return `Stopped after ${done}/${total}: ${p.stopped}${note}`;
  return total
    ? `Finished ${done}/${total} searches${pages}${retries}${empty}.${
        typed ? `\ntyped via ${typed}` : ""
      }${note}`
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
  ]);
  if (typeof settings.wants === "string" && !wants.value)
    wants.value = settings.wants;
  if (typeof settings.searchDelay === "number")
    delay.value = String(settings.searchDelay);
  if (typeof settings.searchPages === "number")
    pages.value = String(settings.searchPages);
  showDelay();
  searchStatus.textContent = describe(settings.searchProgress);
  tally(settings.searchProgress);
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

action("run-search", async () => {
  const [active] = await extensionApi.tabs.query({
    active: true,
    currentWindow: true,
  });
  await ensureCapturing(active?.url);
  const tabId = await activeDiscordTab();
  const seconds = Math.min(15, Math.max(0, Number(delay.value) || 0));
  const pageCount = Math.min(20, Math.max(1, Number(pages.value) || 3));
  await extensionApi.storage.local.set({
    wants: wants.value,
    searchDelay: seconds,
    searchPages: pageCount,
  });
  const response = await toContentScript(tabId, {
    type: "run-search",
    wants: wants.value,
    delayMs: seconds * 1000,
    pages: pageCount,
  });
  if (!response?.ok) throw new Error(response?.error ?? "Could not start.");
  searchStatus.textContent = `Searching 0/${response.value.total}… you can close this popup.`;
  searchTotal.textContent = "0";
  void refresh();
});

action("stop-search", async () => {
  await toContentScript(await activeDiscordTab(), { type: "cancel-search" });
  searchStatus.textContent = "Stopping after the current search…";
});

extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.searchProgress) {
    searchStatus.textContent = describe(changes.searchProgress.newValue);
    tally(changes.searchProgress.newValue);
  }
  // The captured count moves as results render, so keep step 4 current.
  void refresh().catch(() => {});
});

void refreshSearch().catch((error) => {
  searchStatus.textContent = error.message;
});

action("diagnose", async () => {
  const tabId = await activeDiscordTab();
  const response = await toContentScript(tabId, { type: "diagnose" });
  if (!response?.ok) throw new Error(response?.error ?? "No response.");
  const d = response.value;
  const lines = [
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
  searchStatus.textContent = lines.join("\n");
});
