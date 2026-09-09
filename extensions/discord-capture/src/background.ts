import { extensionApi } from "./browser";
import { loadInventory } from "./inventory";
import { channelIds } from "./settings";
import { capture, clear, count, type Entry, entries } from "./store";

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
extensionApi.runtime.onMessage.addListener((request, sender, reply) => {
  if (sender.id !== extensionApi.runtime.id) return;
  const popup = sender.url === extensionApi.runtime.getURL("popup.html");
  const channel = sender.url?.match(
    /^https:\/\/discord\.com\/channels\/\d+\/(\d+)(?:[/?#]|$)/,
  )?.[1];
  const run = async () => {
    if (request?.type === "capture" && channel && isBlock(request.block)) {
      const settings = await extensionApi.storage.local.get("channels");
      const channels = channelIds(settings.channels);
      if (!channels.includes(channel)) throw new Error("Capture is paused");
      let entry: Entry;
      try {
        entry = await capture(request.block);
      } catch {
        await extensionApi.action.setBadgeText({ text: "!" });
        await extensionApi.storage.local.set({
          captureError:
            "Could not save captured posts. Browser storage may be full. Export your index before clearing it.",
        });
        throw new Error("Could not save captured post");
      }
      await extensionApi.storage.local.remove("captureError");
      await extensionApi.action.setBadgeText({ text: String(await count()) });
      return entry;
    }
    if (!popup) throw new Error("Unsupported request");
    if (request?.type === "inventory") {
      const owned = await loadInventory(request.nickname);
      await extensionApi.storage.local.set({
        owned,
        nickname: request.nickname,
      });
      return owned.length;
    }
    if (request?.type === "dump") return entries();
    if (request?.type === "count") return count();
    if (request?.type === "clear") {
      await extensionApi.storage.local.set({ channels: [] });
      await clear();
      await extensionApi.action.setBadgeText({ text: "" });
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
