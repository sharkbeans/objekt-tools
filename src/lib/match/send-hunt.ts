import { track } from "@/lib/analytics";
import {
  isHuntNickname,
  MAX_HUNT_LINE_CHARS,
  MAX_HUNT_LINES,
  PAGE_SOURCE,
  type PageMessage,
  readExtensionMessage,
} from "@/lib/match/extension-handoff";
import type { HuntParams } from "@/lib/match/hunt-url";

/** How long to wait for the extension to confirm before giving up. */
export const SEND_HUNT_TIMEOUT_MS = 2000;

/**
 * The `hunt` message for `p`, or null when there is nothing to send.
 *
 * Only wants travel: the extension's want list is one objekt per line and has
 * no notion of offers. The nickname rides along only when it would pass the
 * extension's own check, so a stray one does not get the whole hunt refused.
 */
export function huntMessage(
  p: HuntParams,
  id: string,
): Extract<PageMessage, { type: "hunt" }> | null {
  const wants = p.wants
    .map((want) => want.trim())
    .filter((want) => want && want.length <= MAX_HUNT_LINE_CHARS)
    .slice(0, MAX_HUNT_LINES);
  if (!wants.length) return null;
  const nickname = p.nickname.trim();
  return {
    source: PAGE_SOURCE,
    type: "hunt",
    id,
    wants: wants.join("\n"),
    nickname: isHuntNickname(nickname) ? nickname : "",
  };
}

function huntId(): string {
  return `hunt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Hand a hunt to the Objekt Match extension as its want list.
 *
 * Resolves true once the extension confirms it stored the list, false when
 * nothing answers in time (not installed, or installed but not yet running in
 * this tab). Call it only from an explicit click — it replaces the list the
 * user has in the extension, which offers an Undo for exactly that reason.
 */
export function sendHuntToExtension(
  p: HuntParams,
  options: { source?: string; timeoutMs?: number } = {},
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const id = huntId();
  const message = huntMessage(p, id);
  if (!message) return Promise.resolve(false);
  const count = message.wants.split("\n").length;
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (ok)
        track("extension_hunt_sent", {
          wants: count,
          mode: p.mode,
          ...(options.source ? { source: options.source } : {}),
        });
      resolve(ok);
    };
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin)
        return;
      const reply = readExtensionMessage(event.data);
      if (reply?.type === "hunt-saved" && reply.id === id) finish(true);
    }
    window.addEventListener("message", onMessage);
    const timer = setTimeout(
      () => finish(false),
      options.timeoutMs ?? SEND_HUNT_TIMEOUT_MS,
    );
    window.postMessage(message, window.location.origin);
  });
}
