/**
 * Custom Umami events. The Umami script is loaded in the root layout; it may
 * be blocked or not loaded yet, so every call is best-effort and silent.
 * Umami already records device type per session — don't add it to event data.
 */

export type TrackData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track: (event: string, data?: TrackData) => void };
  }
}

export function track(event: string, data?: TrackData): void {
  if (typeof window === "undefined") return;
  try {
    window.umami?.track(event, data);
  } catch {
    /* Analytics must never break the page. */
  }
}
