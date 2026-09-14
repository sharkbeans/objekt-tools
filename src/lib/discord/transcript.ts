import { classifyIntent, type IntentSignals } from "@/lib/discord/intent";
import { extractPricing, type PostPricing } from "@/lib/discord/price";
import { extractRemarks } from "@/lib/discord/remarks";
import {
  type ExternalListLink,
  extractExternalListLinks,
} from "@/lib/external-list";
import { membersByArtist } from "@/lib/filters";
import { parsePastedTrade } from "@/lib/paste-parser";

export { extractExternalListLinks } from "@/lib/external-list";

const ALL_MEMBERS = Object.values(membersByArtist).flat();

/**
 * Splits a copied Discord trade-channel transcript into per-poster trade lists.
 *
 * The user selects messages in the channel, copies, and pastes — objekt.my
 * never reads Discord itself. That constraint is the whole design: no bot, no
 * token, no scraping, and (see `messageKey`) no third-party message content
 * ever needs to be stored. See docs/plans/035-discord-paste-match.md.
 */

// Discord's clipboard format puts "<display name> — <timestamp>" on its own
// line. The timestamp is whatever was *rendered*, which varies with how old
// the message is and with the reader's locale and 24-hour-clock setting:
//
//   name — 3:41 PM              today, 12-hour clock
//   name — 15:41                today, 24-hour clock
//   name — Yesterday at 3:41 PM
//   name — Today at 15:41
//   name — 09/05/2026 3:41 PM   older than a day
//   name - 3:41 PM              some clients emit a plain hyphen
//
// Matching only the first shape is not a cosmetic gap: an unrecognised header
// is not a message boundary, so the poster below it is silently folded into
// the poster above and their objekts are attributed to the wrong trader.
// Scrolling up a channel — the documented workflow — guarantees dated headers,
// so every shape here has to be recognised.
//
// Verified against a real dump: handles bracket tags ("[WAV]"), emoji,
// CJK/Hangul names, and the stray trailing comma Discord emits after some
// display names.
const TIME = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp]\.?[Mm]\.?)?`;
const ISO_TIME = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z`;
const WHEN = String.raw`(?:${ISO_TIME}|(?:(?:Today|Yesterday)\s+at\s+|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+|\d{4}-\d{2}-\d{2},?\s+)?${TIME})`;
// The separator must be surrounded by whitespace, which keeps item lines like
// "Lynn E317 - 320" from being mistaken for headers (no "H:MM" follows).
const AUTHOR_LINE = new RegExp(
  String.raw`^(.*?),?\s+[—–-]\s+(${WHEN})\s*$`,
  "i",
);

// Discrub (a Discord export extension) writes a different header:
//
//   @Kira0211 (09/08/2026 10:55 AM)
//
// Without this the entire export has no message boundaries at all and collapses
// into one anonymous poster — a 2,900-message file parses as 13,696 objekts
// owned by nobody, which is worse than not importing it. The name is captured
// lazily because 55 of 420 authors in a real export have spaces in it
// ("@밤이의 불씨", "@alexander uwu"); only the trailing timestamp is a reliable anchor.
const DISCRUB_AUTHOR_LINE = new RegExp(
  String.raw`^@(.*?)\s+\((${WHEN})\)\s*$`,
  "i",
);

/** Author shown for a paste that carries no header line at all. */
export const UNKNOWN_AUTHOR = "Unknown poster";

// Link embeds are rendered into the clipboard as trailing plain-text lines
// after the message body. They are site chrome, never trade content.
const EMBED_TAGLINES = [
  "cosmo objekt explorer",
  "apollo - objekt & gravity explorer for cosmo",
];
const EMBED_TITLE = /·\s*(apollo|objekt tracker)\s*$/i;

// Profile links traders paste in place of typing a list. The captured segment
// is a Cosmo nickname, which resolves to an address and therefore to real,
// on-chain inventory — so a link-only post is the *highest* fidelity entry in
// a dump, not an unreadable one.
const PROFILE_LINK =
  /https?:\/\/(?:www\.)?(apollo\.cafe|objekt\.top|objekt\.my)\/@([^/\s?#]+)/gi;

export type PosterTier = "verified" | "claimed" | "contactless";

export interface TranscriptMessage {
  /** Discord display name. Not unique, not stable, carries no user ID. */
  author: string;
  body: string;
  /** Cosmo nickname from a profile link, when the poster included one. */
  nickname: string | null;
  /** Which site the nickname came from, for attribution in the UI. */
  nicknameSource: "apollo.cafe" | "objekt.top" | "objekt.my" | null;
  /** Public list links that can be imported as this poster's offers on demand. */
  listLinks: ExternalListLink[];
  tier: PosterTier;
  haves: ReturnType<typeof parsePastedTrade>["haves"];
  wants: ReturnType<typeof parsePastedTrade>["wants"];
  notes?: string;
  /** Trade / sell / buy flags. A post can be more than one. */
  intent: IntentSignals;
  /**
   * Objekt key -> the qualifiers the poster attached to it ("prio for grid
   * set", "$5.5", "may decline"). Shown on demand, not in the grid.
   */
  remarks: Record<string, string[]>;
  /** Prices, payment rails and QYOP for this post. */
  pricing: PostPricing;
  /** When Discord says it was posted. Null for a headerless paste. */
  time: MessageTime | null;
  /**
   * How many times this exact list appeared in the paste. Traders bump their
   * post every few minutes, so a repeated list is a sign of an active seller,
   * not a duplicate to hide.
   */
  repeats: number;
  /** Stable id for "already seen this post" suppression. */
  key: string;
}

/** True when the line is Discord link-embed chrome rather than trade content. */
function isEmbedChrome(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (EMBED_TAGLINES.includes(t.toLowerCase())) return true;
  return EMBED_TITLE.test(t);
}

/**
 * Non-cryptographic content hash (FNV-1a, 32-bit) used only to recognise a
 * post that has already been triaged. Dedupe is not a security boundary, and
 * keeping this synchronous avoids dragging `crypto.subtle`'s async API through
 * the render path. Swap for SHA-256 if these keys ever leave the browser.
 */
export function messageKey(author: string, body: string): string {
  const input = `${author.trim().toLowerCase()} ${body
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** First Cosmo profile link in a message body, if any. */
export function extractProfileLink(
  body: string,
): { nickname: string; source: TranscriptMessage["nicknameSource"] } | null {
  PROFILE_LINK.lastIndex = 0;
  const m = PROFILE_LINK.exec(body);
  if (!m) return null;
  let nickname = m[2];
  try {
    nickname = decodeURIComponent(nickname);
  } catch {
    // Malformed percent-encoding — keep the raw segment rather than dropping
    // an otherwise usable nickname.
  }
  if (!nickname) return null;
  return {
    nickname,
    source: m[1].toLowerCase() as TranscriptMessage["nicknameSource"],
  };
}

/**
 * When a message was posted, exactly as Discord rendered it.
 *
 * Only the *text* is trustworthy. Discord renders "7:47 AM" with no date for
 * anything recent and no timezone ever, so this cannot be turned into an
 * absolute instant — but it does not need to be. What it gives, for free and
 * from a string already being matched, is **order and freshness**:
 *
 *   - a trader who reposted at 8:26 has a fresher list than their 7:50 post
 *   - "Yesterday at" / a date prefix marks a list old enough to be stale
 *   - reposts within one paste are recognisable as the same trader refreshing
 *
 * `dated` is the honest flag: false means the paste showed a clock time only,
 * so the message is from the reader's current day and nothing more is known.
 */
export interface MessageTime {
  /** Verbatim, e.g. "7:47 AM", "Yesterday at 3:41 PM", "09/05/2026 3:41 PM". */
  raw: string;
  /** Minutes past midnight, for ordering within a day. Null if unparseable. */
  minutes: number | null;
  /** True when the header carried a date or Today/Yesterday, not just a clock. */
  dated: boolean;
}

/** Parse the rendered timestamp into what can honestly be read from it. */
export function parseMessageTime(raw: string): MessageTime {
  const clock = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?/);
  let minutes: number | null = null;
  if (clock) {
    let h = Number.parseInt(clock[1], 10);
    const m = Number.parseInt(clock[2], 10);
    const half = clock[3]?.toLowerCase();
    if (half === "p" && h !== 12) h += 12;
    if (half === "a" && h === 12) h = 0;
    minutes = h * 60 + m;
  }
  return {
    raw: raw.trim(),
    minutes,
    dated: /today|yesterday|\d{1,2}[/.-]\d{1,2}|\d{4}-\d{2}-\d{2}/i.test(raw),
  };
}

export interface SplitResult {
  blocks: { author: string; body: string; time: MessageTime | null }[];
  /**
   * Non-empty lines above the first recognised header. They belong to a
   * message whose header was cut off by the selection, so there is no author
   * to attribute them to. Counted rather than guessed at, so the UI can say
   * they were dropped instead of leaving the user to notice.
   */
  orphanLines: number;
}

/** Split a raw transcript into message blocks, keeping what was discarded. */
export function splitTranscript(transcript: string): SplitResult {
  const blocks: {
    author: string;
    lines: string[];
    time: MessageTime | null;
  }[] = [];
  let orphanLines = 0;

  for (const line of transcript.split("\n")) {
    const match = line.match(AUTHOR_LINE) ?? line.match(DISCRUB_AUTHOR_LINE);
    if (match) {
      blocks.push({
        author: match[1].trim(),
        lines: [],
        time: parseMessageTime(match[2]),
      });
      continue;
    }
    if (blocks.length > 0) blocks[blocks.length - 1].lines.push(line);
    else if (line.trim()) orphanLines++;
  }

  return {
    blocks: blocks.map((b) => {
      // Embed chrome only ever trails the body; stop at the last content line.
      const lines = [...b.lines];
      while (lines.length > 0) {
        const last = lines[lines.length - 1];
        if (!last.trim() || isEmbedChrome(last)) lines.pop();
        else break;
      }
      return { author: b.author, body: lines.join("\n").trim(), time: b.time };
    }),
    orphanLines,
  };
}

/** Split a raw transcript into message blocks. Exported for testing. */
export function splitMessages(
  transcript: string,
): { author: string; body: string; time: MessageTime | null }[] {
  return splitTranscript(transcript).blocks;
}

export interface TranscriptAnalysis {
  messages: TranscriptMessage[];
  /** @see SplitResult.orphanLines */
  orphanLines: number;
  /**
   * True when the paste carried no header line and was read as a single list.
   * That is what Discord's per-message "Copy Text" produces, so it is a normal
   * way to arrive rather than a malformed paste.
   */
  headerless: boolean;
}

/**
 * Parse a pasted transcript into per-poster trade lists, reporting what could
 * not be attributed.
 *
 * Posters are deduped by content key: traders repost the same list often, and
 * overlapping selections are unavoidable when the user pastes in chunks (see
 * `mergeTranscripts`).
 */
export function analyzeTranscript(transcript: string): TranscriptAnalysis {
  const { blocks, orphanLines } = splitTranscript(transcript);

  // No header at all: Discord's single-message "Copy Text" omits it, and so
  // does a list a trader hands over by hand. Read the whole paste as one
  // anonymous post rather than rejecting it — but only if it actually parses
  // as a trade list, so genuinely unusable text still reports a clear failure.
  if (blocks.length === 0 && transcript.trim()) {
    const messages = collect([
      { author: UNKNOWN_AUTHOR, body: transcript.trim(), time: null },
    ]);
    const usable = messages.some(
      (m) => m.haves.length > 0 || m.wants.length > 0 || m.listLinks.length > 0,
    );
    return {
      messages: usable ? messages : [],
      orphanLines: usable ? 0 : orphanLines,
      headerless: true,
    };
  }

  return { messages: collect(blocks), orphanLines, headerless: false };
}

/** Parse a pasted transcript into per-poster trade lists. */
export function parseTranscript(transcript: string): TranscriptMessage[] {
  return analyzeTranscript(transcript).messages;
}

/** Parse structural message blocks without guessing clipboard boundaries. */
export function collect(
  blocks: { author: string; body: string; time: MessageTime | null }[],
): TranscriptMessage[] {
  const byKey = new Map<string, TranscriptMessage>();
  const out: TranscriptMessage[] = [];

  for (const { author, body, time } of blocks) {
    if (!body) continue;
    const key = messageKey(author, body);
    const already = byKey.get(key);
    if (already) {
      // Same list posted again. Count the bump and keep the latest timestamp,
      // so "posted 4x, last at 8:26" survives instead of the first sighting.
      already.repeats++;
      if (time && (!already.time || after(time, already.time)))
        already.time = time;
      continue;
    }

    const parsed = parsePastedTrade(body);
    const link = extractProfileLink(body);
    const listLinks = extractExternalListLinks(body);
    const hasItems = parsed.haves.length > 0 || parsed.wants.length > 0;

    // A profile link outranks a typed list: it resolves to on-chain inventory,
    // so the claim can actually be verified rather than taken at face value.
    const tier: PosterTier = link
      ? "verified"
      : hasItems || listLinks.length > 0
        ? "claimed"
        : "contactless";

    const message: TranscriptMessage = {
      author,
      body,
      nickname: link?.nickname ?? null,
      nicknameSource: link?.source ?? null,
      listLinks,
      tier,
      haves: parsed.haves,
      wants: parsed.wants,
      notes: parsed.notes,
      intent: classifyIntent(body, parsed),
      remarks: Object.fromEntries(extractRemarks(body, ALL_MEMBERS)),
      pricing: extractPricing(body, ALL_MEMBERS),
      time,
      repeats: 1,
      key,
    };
    byKey.set(key, message);
    out.push(message);
  }

  return out;
}

/** True when `a` was rendered later than `b`. Same-day clock times only. */
function after(a: MessageTime, b: MessageTime): boolean {
  if (a.raw.includes("T") && b.raw.includes("T")) {
    const left = Date.parse(a.raw);
    const right = Date.parse(b.raw);
    if (Number.isFinite(left) && Number.isFinite(right)) return left > right;
  }
  if (a.minutes === null || b.minutes === null) return false;
  return a.minutes > b.minutes;
}

/**
 * Merge a newly pasted chunk into what the user has already pasted.
 *
 * Discord virtualises its message list, so a single selection can only reach a
 * few screens' worth of history. The workflow is therefore paste → scroll →
 * paste again, which guarantees overlapping selections; dedupe by content key
 * makes that overlap harmless.
 */
export function mergeTranscripts(
  existing: TranscriptMessage[],
  incoming: TranscriptMessage[],
): TranscriptMessage[] {
  const byKey = new Map(existing.map((m) => [m.key, m]));
  for (const message of incoming) {
    // Last paste wins: a trader who edited their list should show the new one.
    byKey.set(message.key, message);
  }
  return [...byKey.values()];
}
