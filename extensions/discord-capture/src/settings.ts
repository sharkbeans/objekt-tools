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

/**
 * Channel id from a Discord URL, or null when not on a server channel.
 *
 * Server channels only: a direct message or group DM lives under
 * `/channels/@me/<id>`, and that is deliberately not a channel here. Capture is
 * on by default for every channel this returns, and the privacy policy promises
 * that private conversations are never read — so the one place that decides
 * what counts as a channel is also the place that keeps DMs out of it.
 */
export function channelFromUrl(url: string | undefined | null): string | null {
  if (!isDiscordUrl(url) || !url) return null;
  return url.match(/\/channels\/\d+\/(\d+)/)?.[1] ?? null;
}

/**
 * Whether passive capture keeps posts from `channel`.
 *
 * On by default: a channel is captured unless the user has paused it. That is
 * what agreeing to capture now means, so there is no second step before a
 * channel starts being read — the disclosure says so in as many words.
 */
export function capturing(
  channel: string | null,
  paused: readonly string[],
): boolean {
  return channel !== null && !paused.includes(channel);
}

/** The open channel and its server, as Discord names them in the tab title. */
export interface ChannelLabel {
  channel: string;
  server: string | null;
}

/**
 * Read "#objekt-trade" and "tripleS" out of Discord's tab title.
 *
 * The title is the one place both names appear in plain text that does not
 * depend on Discord's generated class names or on the language it is running
 * in — its aria-labels are translated, its titles are not. The format is not
 * documented and has moved over the years, so this accepts the shapes it has
 * taken rather than one: a leading unread count "(3) ", a leading "Discord | "
 * or trailing " - Discord" / " | Discord", and the parts between separated by
 * " | ". The server is the last part, since a thread title puts the thread and
 * its parent channel in front of it; the channel is the part that starts with
 * "#", or the first one if none does (forum posts and voice text chats).
 */
export function channelLabelFromTitle(
  title: string | undefined | null,
): ChannelLabel | null {
  if (typeof title !== "string") return null;
  const parts = title
    .replace(/^\s*(?:\(\d+\+?\)|[•●])\s*/, "")
    .split(/\s+\|\s+|\s+-\s+Discord\s*$/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "Discord");
  if (!parts.length) return null;
  const channel = parts.find((part) => part.startsWith("#")) ?? parts[0];
  const server = parts.length > 1 ? parts[parts.length - 1] : null;
  return { channel, server: server === channel ? null : server };
}

/** "#objekt-trade - tripleS", or just the channel when the server is unknown. */
export function formatChannelLabel(label: ChannelLabel): string {
  return label.server ? `${label.channel} - ${label.server}` : label.channel;
}
