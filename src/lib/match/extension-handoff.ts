// The contract between the capture extension and objekt.my pages.
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
// Since 1.2.0 the extension also runs a small bridge on objekt.my pages
// (`extensions/discord-capture/src/objekt-bridge.ts`), so a page can ask
// whether it is installed (`ping` → `present`) and hand it a hunt as its want
// list (`hunt` → `hunt-saved`). Hunts flow this way round — page to extension —
// so the extension never has to call objekt.my with the user's session: the
// page already holds the data and posts it, and the extension only stores it.
//
// Kept free of `window` so the extension bundle and the page share it as-is.

/** Stamped on everything the page sends. */
export const PAGE_SOURCE = "objekt-match";
/** Stamped on everything the extension sends. */
export const EXTENSION_SOURCE = "objekt-capture";

/** Upper bound on one delivery, well past what 40,000 posts come to. */
export const MAX_HANDOFF_CHARS = 32 * 1024 * 1024;

/** A hunt carries at most this many objekts, one per line. */
export const MAX_HUNT_LINES = 40;
/** And no line longer than this ("SeoYeon CC101" is 13). */
export const MAX_HUNT_LINE_CHARS = 64;
/** Cosmo nicknames are short handles: letters, digits and a little more. */
const NICKNAME = /^[\w.-]{1,32}$/;

/** Whether `nickname` may ride along with a hunt ("" means none). */
export function isHuntNickname(nickname: string): boolean {
  return nickname === "" || NICKNAME.test(nickname);
}

export type PageMessage =
  | { source: typeof PAGE_SOURCE; type: "ready" }
  | { source: typeof PAGE_SOURCE; type: "received"; id: string; posts: number }
  /** Is the extension installed? Answered with `present`. */
  | { source: typeof PAGE_SOURCE; type: "ping" }
  /**
   * Make this the extension's want list. Sent only when the user presses a
   * button; answered with `hunt-saved` once it is stored.
   */
  | {
      source: typeof PAGE_SOURCE;
      type: "hunt";
      id: string;
      /** One objekt per line, "SeoYeon CC101" style. */
      wants: string;
      /** The Cosmo nickname the hunt is for, or "". */
      nickname: string;
    };

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
  | ({ source: typeof EXTENSION_SOURCE; type: "import" } & HandoffPayload)
  /** The bridge is installed and listening; sent on load and per `ping`. */
  | { source: typeof EXTENSION_SOURCE; type: "present"; version: string }
  /** A `hunt` was stored as the want list; `count` is its objekts. */
  | {
      source: typeof EXTENSION_SOURCE;
      type: "hunt-saved";
      id: string;
      count: number;
    };

function record(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

const ID = /^[\w-]{1,64}$/;
const VERSION = /^\d{1,5}(?:\.\d{1,5}){0,3}$/;
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
  if (message.type === "present")
    return typeof message.version === "string" && VERSION.test(message.version)
      ? { source: EXTENSION_SOURCE, type: "present", version: message.version }
      : null;
  if (message.type === "hunt-saved")
    return typeof message.id === "string" &&
      ID.test(message.id) &&
      typeof message.count === "number" &&
      Number.isInteger(message.count) &&
      message.count >= 0 &&
      message.count <= MAX_HUNT_LINES
      ? {
          source: EXTENSION_SOURCE,
          type: "hunt-saved",
          id: message.id,
          count: message.count,
        }
      : null;
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

/**
 * A hunt's want list cleaned to one objekt per line, or null when it is empty
 * or over the limits. Over-long input is refused rather than truncated: a
 * silently shortened hunt looks complete and is not.
 */
export function readHuntWants(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > MAX_HUNT_LINES * (MAX_HUNT_LINE_CHARS + 2)) return null;
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    !lines.length ||
    lines.length > MAX_HUNT_LINES ||
    lines.some((line) => line.length > MAX_HUNT_LINE_CHARS)
  )
    return null;
  return lines.join("\n");
}

/**
 * A page message, or null for anything else on the channel.
 *
 * This is what the extension's bridge trusts on objekt.my, so a `hunt` is
 * validated in full here: an id it can echo, a bounded want list, and a
 * nickname in the Cosmo charset or none at all.
 */
export function readPageMessage(data: unknown): PageMessage | null {
  const message = record(data);
  if (message?.source !== PAGE_SOURCE) return null;
  if (message.type === "ready") return { source: PAGE_SOURCE, type: "ready" };
  if (message.type === "ping") return { source: PAGE_SOURCE, type: "ping" };
  if (message.type === "hunt") {
    const wants = readHuntWants(message.wants);
    const nickname =
      typeof message.nickname === "string" ? message.nickname.trim() : null;
    if (
      typeof message.id !== "string" ||
      !ID.test(message.id) ||
      wants === null ||
      nickname === null ||
      !isHuntNickname(nickname)
    )
      return null;
    return {
      source: PAGE_SOURCE,
      type: "hunt",
      id: message.id,
      wants,
      nickname,
    };
  }
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
