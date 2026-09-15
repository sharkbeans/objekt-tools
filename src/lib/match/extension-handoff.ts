// The contract between the capture extension and /match.
//
// The extension hands a search's posts straight to an open /match tab instead
// of making the user download a file and import it. It does that from a script
// injected into the tab, which shares the page's window but not its JavaScript,
// so the only channel between them is `window.postMessage` — and both sides
// have to agree on the shape of every message, which is what this file is.
//
// The handshake exists because /match loads its saved posts asynchronously.
// A transcript merged before that load lands is overwritten by it, so the page
// announces `ready` only once it can take posts, the extension sends nothing
// before hearing it, and the page acknowledges by id so a repeated delivery is
// neither lost nor applied twice.
//
// Kept free of `window` so the extension bundle and the page share it as-is.

/** Stamped on everything the page sends. */
export const PAGE_SOURCE = "objekt-match";
/** Stamped on everything the extension sends. */
export const EXTENSION_SOURCE = "objekt-capture";

/** Upper bound on one delivery, well past what 40,000 posts come to. */
export const MAX_HANDOFF_CHARS = 32 * 1024 * 1024;

export type PageMessage =
  | { source: typeof PAGE_SOURCE; type: "ready" }
  | { source: typeof PAGE_SOURCE; type: "received"; id: string; posts: number };

export interface HandoffPayload {
  /** Identifies one delivery, so a repeat is acknowledged, not re-applied. */
  id: string;
  /** The transcript, in the same text form a .txt export holds. */
  transcript: string;
  /** The Cosmo nickname saved in the extension, or "" when there is none. */
  nickname: string;
  /** The want list the search ran on, one objekt per line. */
  wants: string;
  /**
   * Post content key (`messageKey(author, body)`) -> a link that opens that
   * message in Discord. Posts whose guild was not known have none.
   */
  links: Record<string, string>;
}

export type ExtensionMessage =
  | { source: typeof EXTENSION_SOURCE; type: "hello" }
  | ({ source: typeof EXTENSION_SOURCE; type: "import" } & HandoffPayload);

function record(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

const ID = /^[\w-]{1,64}$/;
const CONTENT_KEY = /^[0-9a-f]{8}$/;
/** The only link a delivery may attach to a post: one Discord message. */
export const DISCORD_MESSAGE_URL =
  /^https:\/\/(?:canary\.|ptb\.)?discord\.com\/channels\/\d{1,20}\/\d{1,20}\/\d{1,20}$/;

/** Only well-formed keys pointing at Discord messages survive. */
function readLinks(value: unknown): Record<string, string> {
  const links: Record<string, string> = {};
  const entries = record(value);
  if (!entries) return links;
  for (const [key, url] of Object.entries(entries))
    if (
      CONTENT_KEY.test(key) &&
      typeof url === "string" &&
      DISCORD_MESSAGE_URL.test(url)
    )
      links[key] = url;
  return links;
}

/**
 * An extension message, or null for anything else on the channel.
 *
 * Every window message reaches the listener — the page's own, other scripts',
 * browser tooling's — so this is a filter first and a validator second.
 */
export function readExtensionMessage(data: unknown): ExtensionMessage | null {
  const message = record(data);
  if (message?.source !== EXTENSION_SOURCE) return null;
  if (message.type === "hello")
    return { source: EXTENSION_SOURCE, type: "hello" };
  if (
    message.type !== "import" ||
    typeof message.id !== "string" ||
    !ID.test(message.id) ||
    typeof message.transcript !== "string" ||
    !message.transcript.trim() ||
    message.transcript.length > MAX_HANDOFF_CHARS
  )
    return null;
  return {
    source: EXTENSION_SOURCE,
    type: "import",
    id: message.id,
    transcript: message.transcript,
    nickname:
      typeof message.nickname === "string" ? message.nickname.slice(0, 30) : "",
    wants:
      typeof message.wants === "string" ? message.wants.slice(0, 20_000) : "",
    links: readLinks(message.links),
  };
}

/** A page message, or null for anything else on the channel. */
export function readPageMessage(data: unknown): PageMessage | null {
  const message = record(data);
  if (message?.source !== PAGE_SOURCE) return null;
  if (message.type === "ready") return { source: PAGE_SOURCE, type: "ready" };
  if (
    message.type === "received" &&
    typeof message.id === "string" &&
    typeof message.posts === "number" &&
    Number.isFinite(message.posts)
  )
    return {
      source: PAGE_SOURCE,
      type: "received",
      id: message.id,
      posts: message.posts,
    };
  return null;
}
