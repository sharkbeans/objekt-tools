import { channelIds } from "./settings";

const status = document.getElementById("status") as HTMLElement;
async function request(type: string) {
  const response = await chrome.runtime.sendMessage({ type });
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
  status.textContent = `${await request("count")} distinct posts captured`;
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
