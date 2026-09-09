import { indexOwned, matchTranscript } from "@/lib/discord/match";
import { extensionApi } from "./browser";
import { MESSAGE_SELECTOR, readMessage } from "./dom";
import { inventoryRows } from "./inventory";
import { findSearchBox, runSearches, searchQueries } from "./search";
import { channelFromUrl, channelIds } from "./settings";
import type { Entry } from "./store";

let owned = indexOwned([]);
let revision = 0;
function annotate(element: Element, entry: Entry) {
  element.querySelector(":scope > objekt-match-badge")?.remove();
  const count =
    matchTranscript([entry.parsed], owned)[0]?.theyWantYouHave.length ?? 0;
  if (!count) return;
  const host = document.createElement("objekt-match-badge");
  const shadow = host.attachShadow({ mode: "closed" });
  const badge = document.createElement("span");
  badge.textContent = `objekt.my · wants ${count} of yours`;
  badge.style.cssText =
    "display:inline-block;margin:4px 0;padding:3px 8px;border-radius:8px;background:#312e81;color:#eef2ff;font:12px system-ui";
  shadow.append(badge);
  element.append(host);
}

let channels: string[] = [];
let seen = new WeakMap<Element, string>();
const pending = new WeakSet<Element>();
async function scan(element: Element) {
  if (pending.has(element)) return;
  const message = readMessage(element);
  // The channel comes from the message itself, so search results are captured
  // from any enabled channel rather than only the one currently open.
  if (message && !channels.includes(message.channel)) return;
  if (!message) {
    element.querySelector(":scope > objekt-match-badge")?.remove();
    return;
  }
  const signature = JSON.stringify([message, revision]);
  if (seen.get(element) === signature) return;
  pending.add(element);
  try {
    const response = await extensionApi.runtime.sendMessage({
      type: "capture",
      channel: message.channel,
      id: message.id,
      block: {
        author: message.author,
        body: message.body,
        time: message.time.raw,
      },
    });
    if (response?.ok) {
      // A virtualized row may have been recycled while the worker was saving.
      const current = readMessage(element);
      if (
        element.isConnected &&
        current &&
        channels.includes(current.channel) &&
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
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["id", "datetime", "aria-labelledby"],
});
function update(settings: Record<string, unknown>) {
  if ("channels" in settings) channels = channelIds(settings.channels);
  if ("owned" in settings) {
    try {
      owned = indexOwned(inventoryRows(settings.owned ?? []));
    } catch {
      owned = indexOwned([]);
    }
  }
  revision++;
  seen = new WeakMap();
  for (const badge of document.querySelectorAll("objekt-match-badge"))
    badge.remove();
  visit(document.body);
}
// A full run outlives the popup, which closes as soon as it loses focus, so
// progress goes to storage and the popup reads it whenever it reopens.
const searchSignal = { cancelled: false };
let searching = false;
async function report(progress: Record<string, unknown>) {
  await extensionApi.storage.local.set({ searchProgress: progress });
}
extensionApi.runtime.onMessage.addListener((request, sender, reply) => {
  if (sender.id !== extensionApi.runtime.id) return;
  if (request?.type === "diagnose") {
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
    reply({
      ok: true,
      value: {
        url: location.href,
        channel: channelFromUrl(location.href),
        enabled: channels,
        elements: elements.length,
        readable: readable.length,
        sampleId: elements[0]?.id ?? null,
        searchBox: Boolean(findSearchBox(document)),
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
  if (searching) {
    reply({ ok: false, error: "A search run is already in progress." });
    return true;
  }
  const queries = searchQueries(String(request.wants ?? ""));
  if (!queries.length) {
    reply({ ok: false, error: "No objekts recognized. Try YooYeon CC101." });
    return true;
  }
  const delayMs = Number(request.delayMs);
  const pages = Number(request.pages);
  searching = true;
  searchSignal.cancelled = false;
  // Reply now: the popup is gone long before this finishes.
  reply({ ok: true, value: { total: queries.length } });
  void report({ done: 0, total: queries.length, query: "", running: true })
    .then(() =>
      runSearches(document, queries, {
        delayMs: Number.isFinite(delayMs) ? Math.max(500, delayMs) : 3000,
        pages: Number.isFinite(pages) ? Math.min(20, Math.max(1, pages)) : 1,
        signal: searchSignal,
        onProgress: (progress) => void report({ ...progress, running: true }),
      }),
    )
    .then(
      (run) => report({ ...run, total: queries.length, running: false }),
      (error) =>
        report({
          done: 0,
          total: queries.length,
          running: false,
          stopped: error instanceof Error ? error.message : "Search failed.",
        }),
    )
    .finally(() => {
      searching = false;
    });
  return true;
});
extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const settings: Record<string, unknown> = {};
  for (const key of ["channels", "owned"])
    if (changes[key]) settings[key] = changes[key].newValue;
  if (Object.keys(settings).length) update(settings);
});
void extensionApi.storage.local.get(["channels", "owned"]).then(update);
