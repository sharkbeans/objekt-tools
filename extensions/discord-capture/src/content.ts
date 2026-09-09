import { indexOwned, matchTranscript } from "@/lib/discord/match";
import { MESSAGE_SELECTOR, readMessage } from "./dom";
import { inventoryRows } from "./inventory";
import { channelIds } from "./settings";
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
  const channel = location.pathname.match(/^\/channels\/\d+\/(\d+)/)?.[1];
  if (!channel || !channels.includes(channel) || pending.has(element)) return;
  const message = readMessage(element, channel);
  if (!message) {
    element.querySelector(":scope > objekt-match-badge")?.remove();
    return;
  }
  const signature = JSON.stringify([message, revision]);
  if (seen.get(element) === signature) return;
  pending.add(element);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "capture",
      block: { ...message, time: message.time.raw },
    });
    if (response?.ok) {
      // A virtualized row may have been recycled while the worker was saving.
      const current = readMessage(element, channel);
      if (
        element.isConnected &&
        channels.includes(channel) &&
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
    const current = readMessage(element, channel);
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const settings: Record<string, unknown> = {};
  for (const key of ["channels", "owned"])
    if (changes[key]) settings[key] = changes[key].newValue;
  if (Object.keys(settings).length) update(settings);
});
void chrome.storage.local.get(["channels", "owned"]).then(update);
