import { parseMessageTime } from "@/lib/discord/transcript";
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
  const channel = own ? own[1] : channelFromRow(element);
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
    author,
    body: text,
    time: parseMessageTime(new Date(iso).toISOString()),
  };
}

/**
 * The channel a search result was posted in.
 *
 * Every result links back to where it came from — /channels/<guild>/<channel>
 * — which is the only place the channel appears once the chat-messages wrapper
 * is gone.
 */
function channelFromRow(element: Element): string | null {
  for (const link of element.querySelectorAll('a[href*="/channels/"]')) {
    const channel = link
      .getAttribute("href")
      ?.match(/\/channels\/[^/]+\/(\d+)/)?.[1];
    if (channel) return channel;
  }
  return null;
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
