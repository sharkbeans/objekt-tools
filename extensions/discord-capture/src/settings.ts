export function channelIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (id): id is string => typeof id === "string" && /^\d+$/.test(id),
      )
    : [];
}

// Discord serves the app from three hosts, and channel switching is a
// pushState — so a tab can be sitting on /channels/... while the content
// script was injected against a completely different URL.
const DISCORD_ORIGIN = /^https:\/\/(?:canary\.|ptb\.)?discord\.com\//;

export function isDiscordUrl(url: string | undefined | null): boolean {
  return typeof url === "string" && DISCORD_ORIGIN.test(url);
}

/** Channel id from a Discord URL, or null when not on a channel. */
export function channelFromUrl(url: string | undefined | null): string | null {
  if (!isDiscordUrl(url) || !url) return null;
  return url.match(/\/channels\/[^/]+\/(\d+)/)?.[1] ?? null;
}
