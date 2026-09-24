import { parseMessageTime } from "@/lib/discord/transcript";
import { channelLabelFromTitle } from "./settings";
export const MESSAGE_SELECTOR = '[id^="chat-messages-"]';

/**
 * The message body, which every message Discord renders carries.
 *
 * Search results do not get a `chat-messages-<channel>-<id>` wrapper — measured
 * on a real results page, 48 rendered messages produced only 22 of those, the
 * 22 belonging to the channel list behind the panel. The body's id is the one
 * anchor both kinds share, and it carries the message id outright.
 */
export const MESSAGE_BODY = '[id^="message-content-"]';

/** Bodies inside `scope` that belong to search results, not the channel list. */
export function resultBodies(scope: Element): Element[] {
  return [...scope.querySelectorAll(MESSAGE_BODY)].filter(
    (body) => !body.closest(MESSAGE_SELECTOR),
  );
}

/** The row element wrapping a message body. */
export function rowOf(body: Element): Element {
  return body.closest("li") ?? body.parentElement ?? body;
}

/**
 * A stable key for a rendered row.
 *
 * Channel rows have their own id; result rows do not, so an id-keyed set would
 * collapse every result onto the empty string. The body id is unique either way
 * because it embeds Discord's message id.
 */
export function rowKey(element: Element): string {
  return element.querySelector(MESSAGE_BODY)?.id || element.id;
}
/**
 * Read one rendered message, reporting which channel it belongs to.
 *
 * The channel comes from the element id rather than the page URL: search
 * results render in their own panel and can come from any channel in the
 * guild, while the URL still points at whatever channel is open. The caller
 * decides whether that channel is one the user enabled.
 *
 * Fail closed: never borrow an author from an adjacent message or reply.
 */
export function readMessage(element: Element) {
  const own = element.id.match(/^chat-messages-(\d+)-(\d+)$/);
  // A search result has no chat-messages wrapper, so its message id comes from
  // the one anchor it does carry. Exactly one body per row, or this is a
  // container rather than a row and nothing here is safe to attribute.
  const bodies = element.querySelectorAll(MESSAGE_BODY);
  const body = own
    ? element.querySelector(`[id="message-content-${own[2]}"]`)
    : bodies.length === 1
      ? bodies[0]
      : null;
  if (!body) return null;
  const id = own ? own[2] : body.id.slice("message-content-".length);
  if (!/^\d+$/.test(id)) return null;
  const source = own ? "channel" : "search";
  // The channel list names its channel in the row id. A result does not, so it
  // comes from the link Discord puts on each result back to where it was posted
  // — and is null when that link is not there.
  const origin = own
    ? null
    : (whereFromRow(element) ?? openChannelOfGroup(element));
  const channel = own ? own[1] : (origin?.channel ?? null);
  // The guild is only needed to link back to the message. A channel row is in
  // the channel the page has open; a result says where it was posted.
  const guild = own
    ? guildOfOpenChannel(element.ownerDocument, own[1])
    : (origin?.guild ?? null);
  // Keyed to this message where possible, which is stricter than "the only
  // timestamp in the row"; that rule stays as the fallback.
  const times = element.querySelectorAll("time[datetime]");
  const time =
    element.querySelector(`[id="message-timestamp-${id}"] time[datetime]`) ??
    (times.length === 1 ? times[0] : null);
  const iso = time?.getAttribute("datetime");
  if (
    !iso ||
    !/^\d{4}-\d{2}-\d{2}T/.test(iso) ||
    !Number.isFinite(Date.parse(iso))
  )
    return null;
  // Grouped posts reference the original author through aria-labelledby.
  const ownAuthor = element.querySelector(`[id="message-username-${id}"]`);
  const refs = (element.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .filter((ref) => /^message-username-\d+$/.test(ref));
  const authorNode =
    ownAuthor ??
    (refs.length === 1 ? element.ownerDocument.getElementById(refs[0]) : null);
  const author = authorNode?.textContent?.trim();
  if (!author || /[\r\n]/.test(author)) return null;
  const text = readText(body).trim();
  if (!text) return null;
  return {
    channel,
    /** Which list this row came from, which decides whether it is filtered. */
    source,
    // Discord's own message id. Unique and stable, unlike the rendered author
    // name, which gains a server tag as the row hydrates.
    id,
    guild,
    author,
    body: text,
    time: parseMessageTime(new Date(iso).toISOString()),
  };
}

/**
 * The guild and channel a search result was posted in.
 *
 * Every result links back to where it came from — /channels/<guild>/<channel>
 * — which is the only place the channel appears once the chat-messages wrapper
 * is gone. The guild is null for a link that does not name a numeric one.
 */
function whereFromRow(
  element: Element,
): { guild: string | null; channel: string } | null {
  for (const link of element.querySelectorAll('a[href*="/channels/"]')) {
    const match = link
      .getAttribute("href")
      ?.match(/\/channels\/([^/]+)\/(\d+)/);
    if (match)
      return {
        guild: /^\d+$/.test(match[1]) ? match[1] : null,
        channel: match[2],
      };
  }
  return null;
}

/**
 * The open channel, for a search result filed under that channel's name.
 *
 * Discord's results carry no channel id anywhere — no link back, and "Jump" is
 * a button. What they do carry is the group they are listed under,
 * `<ul role="group" aria-label="objekt-trade, COSMO">` (channel, then
 * category). The open channel's id is in the URL and its name in the tab title,
 * so a result grouped under that name was posted there. Results from any other
 * channel stay unplaced rather than guessed.
 */
function openChannelOfGroup(
  element: Element,
): { guild: string; channel: string } | null {
  const doc = element.ownerDocument;
  const open = doc.location?.pathname.match(/^\/channels\/(\d+)\/(\d+)/);
  const name = channelLabelFromTitle(doc.title)?.channel.replace(/^#/, "");
  const group = element
    .closest('[role="group"][aria-label]')
    ?.getAttribute("aria-label");
  if (!open || !name || !group) return null;
  return group === name || group.startsWith(`${name}, `)
    ? { guild: open[1], channel: open[2] }
    : null;
}

/** The guild of the channel the page has open, if that is `channel`. */
function guildOfOpenChannel(doc: Document, channel: string): string | null {
  const open = doc.location?.pathname.match(/^\/channels\/(\d+)\/(\d+)/);
  return open && open[2] === channel ? open[1] : null;
}

/** A link that opens one message in Discord, or null without a guild and channel. */
export function messageLink(
  guild: string | null | undefined,
  channel: string | null | undefined,
  id: string,
): string | null {
  return guild && channel && /^\d+$/.test(guild) && /^\d+$/.test(channel)
    ? `https://discord.com/channels/${guild}/${channel}/${id}`
    : null;
}
function readText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  if (el.tagName === "BR") return "\n";
  if (el.tagName === "IMG") return el.getAttribute("alt") ?? "";
  const text = Array.from(el.childNodes, readText).join("");
  if (el.tagName === "A") {
    const href = el.getAttribute("href");
    return href?.startsWith("https://") && !text.includes(href)
      ? `${text} ${href}`
      : text;
  }
  return /^(DIV|P|LI|PRE|BLOCKQUOTE)$/.test(el.tagName) ? `\n${text}\n` : text;
}
