import { extensionApi } from "./browser";
import { loadInventory } from "./inventory";
import { channelIds, isDiscordUrl } from "./settings";
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
  // The sender URL proves the message came from a Discord page; which channel
  // the post belongs to comes from the message, because search results render
  // posts from channels other than the one currently open.
  const fromDiscord = isDiscordUrl(sender.url);
  const channel =
    typeof request?.channel === "string" && /^\d+$/.test(request.channel)
      ? request.channel
      : null;
  // A search result is kept wherever it was posted; only channel browsing is
  // gated on the enabled list. Results also reach here with no channel at all
  // when Discord does not link one, which is why the key falls back to the
  // message id — unique on its own, since it is a snowflake.
  const fromSearch = request?.source === "search";
  // Which search produced this post, so the export can be scoped to it.
  const searchRun =
    fromSearch && typeof request?.run === "string" && request.run
      ? request.run
      : undefined;
  const messageId =
    typeof request?.id === "string" && /^\d+$/.test(request.id)
      ? request.id
      : null;
  const run = async () => {
    if (
      request?.type === "capture" &&
      fromDiscord &&
      (channel || fromSearch) &&
      messageId &&
      isBlock(request.block)
    ) {
      if (!fromSearch) {
        const settings = await extensionApi.storage.local.get("channels");
        const channels = channelIds(settings.channels);
        if (!channel || !channels.includes(channel))
          throw new Error("Capture is paused");
      }
      let entry: Entry;
      try {
        entry = await capture(
          request.block,
          channel ? `${channel}-${messageId}` : messageId,
          searchRun,
        );
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
    if (request?.type === "count")
      return count(typeof request.run === "string" ? request.run : undefined);
    if (request?.type === "clear") {
      // Clears posts only. Pausing capture is a separate, deliberate action —
      // wiping the enabled channels here silently stopped collection and the
      // button name gave no hint that it would.
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
