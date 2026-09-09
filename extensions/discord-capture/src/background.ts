import { channelIds } from "./settings";
import { capture, clear, count, entries } from "./store";

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
chrome.runtime.onMessage.addListener((request, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const popup = sender.url === chrome.runtime.getURL("popup.html");
  const channel = sender.url?.match(
    /^https:\/\/discord\.com\/channels\/\d+\/(\d+)(?:[/?#]|$)/,
  )?.[1];
  const run = async () => {
    if (request?.type === "capture" && channel && isBlock(request.block)) {
      const settings = await chrome.storage.local.get("channels");
      const channels = channelIds(settings.channels);
      if (!channels.includes(channel)) throw new Error("Capture is paused");
      const entry = await capture(request.block);
      await chrome.action.setBadgeText({ text: String(await count()) });
      return entry;
    }
    if (!popup) throw new Error("Unsupported request");
    if (request?.type === "dump") return entries();
    if (request?.type === "count") return count();
    if (request?.type === "clear") {
      await clear();
      await chrome.action.setBadgeText({ text: "" });
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
