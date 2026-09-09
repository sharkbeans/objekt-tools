import { MESSAGE_SELECTOR, readMessage } from "./dom";
import { channelIds } from "./settings";

let channels: string[] = [];
const seen = new WeakMap<Element, string>();
const pending = new WeakSet<Element>();
async function scan(element: Element) {
  const channel = location.pathname.match(/^\/channels\/\d+\/(\d+)/)?.[1];
  if (!channel || !channels.includes(channel) || pending.has(element)) return;
  const message = readMessage(element, channel);
  if (!message) return;
  const signature = JSON.stringify(message);
  if (seen.get(element) === signature) return;
  pending.add(element);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "capture",
      block: { ...message, time: message.time.raw },
    });
    if (response?.ok) seen.set(element, signature);
  } catch {
    /* Extension reload or unavailable worker: retry on the next render. */
  } finally {
    pending.delete(element);
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
    visit(record.target);
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.channels) {
    channels = channelIds(changes.channels.newValue);
    visit(document.body);
  }
});
void chrome.storage.local.get("channels").then((settings) => {
  channels = channelIds(settings.channels);
  visit(document.body);
});
