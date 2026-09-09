import { parseOffering } from "@/lib/discord/match";
import { exportTranscript } from "./export";
import { channelIds } from "./settings";
import type { Entry } from "./store";

const status = document.getElementById("status") as HTMLElement;
async function request(type: string, extra: Record<string, unknown> = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extra });
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
async function refresh() {
  const settings = await chrome.storage.local.get(["captureError", "channels"]);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const channel = tab?.url?.match(
    /^https:\/\/discord\.com\/channels\/\d+\/(\d+)/,
  )?.[1];
  const enabled = channel && channelIds(settings.channels).includes(channel);
  status.textContent =
    typeof settings.captureError === "string"
      ? settings.captureError
      : `${await request("count")} distinct posts captured. ${enabled ? "This channel is enabled." : "Capture is paused for this tab."}`;
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const channel = tab?.url?.match(
    /^https:\/\/discord\.com\/channels\/\d+\/(\d+)/,
  )?.[1];
  if (!channel) throw new Error("Open a Discord server trade channel first.");
  const settings = await chrome.storage.local.get("channels");
  const channels = channelIds(settings.channels);
  const enabled = channels.includes(channel);
  await chrome.storage.local.set({
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

action("export", async () => {
  const posts: Entry[] = await request("dump");
  download(
    exportTranscript(posts.map((post) => post.block)),
    "objekt-discord-transcript.txt",
    "text/plain;charset=utf-8",
  );
  status.textContent = "Downloaded. Open /match and choose Import text files.";
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
  await chrome.storage.local.set({ owned, nickname: "", haves: haves.value });
  inventoryStatus.textContent = `${owned.length} typed haves saved`;
});
action("load-inventory", async () => {
  const allowed = await chrome.permissions.request({
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
void chrome.storage.local
  .get(["owned", "nickname", "haves"])
  .then((settings) => {
    inventoryStatus.textContent = `${Array.isArray(settings.owned) ? settings.owned.length : 0} saved haves`;
    nickname.value =
      typeof settings.nickname === "string" ? settings.nickname : "";
    haves.value = typeof settings.haves === "string" ? settings.haves : "";
  });
