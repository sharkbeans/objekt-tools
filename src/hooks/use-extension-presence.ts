"use client";

import { useEffect, useState } from "react";
import {
  PAGE_SOURCE,
  type PageMessage,
  readExtensionMessage,
} from "@/lib/match/extension-handoff";

export interface ExtensionPresence {
  /** null while still asking; false once the timeout passes unanswered. */
  installed: boolean | null;
  /** The extension's version, once it has answered. */
  version: string | null;
}

/** How long an unanswered ping takes to mean "not installed". */
export const PRESENCE_TIMEOUT_MS = 1500;

/**
 * Whether the Objekt Match extension is installed in this browser.
 *
 * Its objekt.my bridge answers a `ping` with `present` (see
 * `extension-handoff.ts`); it also announces itself when it loads, so the
 * listener stays up after the timeout and a late answer — the extension was
 * just installed and the worker injected the bridge into this tab — still
 * flips `installed` to true.
 */
export function useExtensionPresence(
  timeoutMs = PRESENCE_TIMEOUT_MS,
): ExtensionPresence {
  const [presence, setPresence] = useState<ExtensionPresence>({
    installed: null,
    version: null,
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin)
        return;
      const message = readExtensionMessage(event.data);
      if (message?.type !== "present") return;
      clearTimeout(timer);
      setPresence({ installed: true, version: message.version });
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(
      () =>
        setPresence((current) =>
          current.installed === null
            ? { installed: false, version: null }
            : current,
        ),
      timeoutMs,
    );
    const ping: PageMessage = { source: PAGE_SOURCE, type: "ping" };
    window.postMessage(ping, window.location.origin);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [timeoutMs]);

  return presence;
}
