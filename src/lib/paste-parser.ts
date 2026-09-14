/**
 * Paste-to-trade parser
 *
 * Supports community formats:
 *
 * 1. Simple — one objekt per line:
 *    HAVE
 *    SeoYeon AA201
 *    HyeRin B205
 *    WANT
 *    DaHyun BB345
 *
 * 2. Grouped — member followed by comma-separated collection numbers:
 *    HAVE
 *    Kaede bb104, bb105, bb108
 *    Nakyoung bb101, bb104
 *    WANT
 *    Any bb343 bb344 bb345
 *
 * 3. Multi-word headers: "## Have FCO", "HAVE (1:1)", "WTS", "WTB", "WANT bb"
 *    WTS → have section, WTB → want section, extra words ignored
 *    "1:1" in a header → goes to poster notes
 *
 * 4. Inline features:
 *    x3 or (4) after a token → quantity
 *    #1 or #20x after a token → serial/copy number
 *    BB117-BB120 → expanded to 4 items
 *    Bare 3-digit numbers inherit the season prefix from the same line
 */

import { membersByArtist, shortformMembers } from "@/lib/filters";
import { sanitizeNoteText } from "@/lib/sanitize-text";
import { seasonPrefixMap } from "@/lib/season-prefix";

const allMembers = Object.values(membersByArtist).flat();

const defaultOnOfflineByPrefix: Record<string, "online" | "offline"> = {
  CC: "offline",
};

export interface ParsedItem {
  member: string | null; // resolved member name, null for "any member" wants
  season: string; // resolved season e.g. "Binary02"
  collectionNo: string; // raw digits e.g. "345"
  raw: string; // original text for error display
  quantity?: number; // e.g. 3 from "x3" or "(3)"
  serial?: string; // user-specified serial/copy, e.g. "1", "20x"
  onOffline?: "online" | "offline"; // when explicitly specified via a/z suffix
  freeform?: boolean; // text-only poster item, e.g. "Any E/AA/BB Spin Fuel"
  isAny?: boolean; // ANY-filter want: no specific objekt, just filter criteria
  artist?: string | null;
  class?: string | null;
}

export interface ParseResult {
  haves: ParsedItem[];
  wants: ParsedItem[];
  errors: string[];
  notes?: string;
}

/** Case-insensitive member resolve: shortform → full name, or exact match */
function resolveMember(text: string, atLineStart = true): string | null {
  const lower = text.toLowerCase();
  const shortform = shortformMembers[lower];
  // One-letter aliases such as x (Xinyu) and m (Mayu) are useful at the
  // beginning of a list, but mid-line they are normally separators in a
  // collab code ("S5 x S20 CC601"), not an owner.
  if (shortform) return atLineStart || lower.length > 2 ? shortform : null;
  const exact = allMembers.find((m) => m.toLowerCase() === lower);
  return exact ?? null;
}

// Matches a season-prefix + 3-digit collection number, optional trailing a/z.
// Also supports future generation shorthand like D2101Z -> Divine02 101Z.
const collectionRe = /^([A-Za-z]*)(\d{3})([azAZ]?)$/i;
const generatedCollectionRe = /^([A-Za-z])([2-9])(\d{3})([azAZ]?)$/i;

interface ParsedCollection {
  season: string;
  digits: string;
  prefix: string;
  onOffline: "online" | "offline" | null;
}

function parseCollectionToken(token: string): ParsedCollection | null {
  const generatedMatch = token.match(generatedCollectionRe);
  if (generatedMatch) {
    const basePrefix = generatedMatch[1].toUpperCase();
    const generation = Number.parseInt(generatedMatch[2], 10);
    const prefix = basePrefix.repeat(generation);
    const season = seasonPrefixMap[prefix];
    if (!season) return null;
    const suffix = generatedMatch[4].toLowerCase();
    const onOffline =
      suffix === "a"
        ? "online"
        : suffix === "z"
          ? "offline"
          : (defaultOnOfflineByPrefix[prefix] ?? null);
    return {
      season,
      digits: generatedMatch[3],
      prefix,
      onOffline,
    };
  }

  const m = token.match(collectionRe);
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const digits = m[2];
  const suffix = m[3].toLowerCase();
  const season = prefix ? seasonPrefixMap[prefix] : null;
  if (prefix && !season) return null; // unknown prefix
  if (!season) return null; // bare digits without prefix
  const onOffline =
    suffix === "a"
      ? "online"
      : suffix === "z"
        ? "offline"
        : (defaultOnOfflineByPrefix[prefix] ?? null);
  return { season, digits, prefix, onOffline };
}

/**
 * Strip Discord formatting from a line before checking if it's a header or item.
 * Handles common Discord markdown wrappers: headings, bold/italic/underline,
 * strikethrough, spoiler bars, inline code, brackets, and trailing colons.
 */
function stripDiscordFormatting(line: string): string {
  return line
    .trim()
    .replace(/^>\s*/, "") // > blockquote
    .replace(/^#{1,3}\s+/, "") // # heading, ## heading, ### heading
    .replace(/^[-*]\s+/, "") // list bullets
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\|\|([^|]+)\|\|/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/[_*]+/g, "")
    .replace(/[[\]]/g, "") // [brackets]
    .replace(/:$/, "") // trailing colon
    .trim();
}

/**
 * Detect HAVE/WANT section header (multi-word aware).
 * WTS → have, WTB → want.
 * Extra words (FCO, DCO, "Ever", etc.) are ignored.
 * Returns hasOneToOne=true if "1:1" appears in the header.
 */
function isSectionHeader(line: string): {
  section: "have" | "want";
  hasOneToOne: boolean;
  /**
   * Whatever follows the header keyword on the same line. Traders often write
   * the whole trade on one line each ("Have: Shion bb306" / "Want Lynn bb305");
   * discarding the remainder loses the entire post.
   */
  rest: string;
} | null {
  const stripped = stripDiscordFormatting(line);
  const lower = stripped.toLowerCase();

  // Single-letter shorthands [H], [W]
  if (lower === "h") return { section: "have", hasOneToOne: false, rest: "" };
  if (lower === "w") return { section: "want", hasOneToOne: false, rest: "" };

  const match = stripped.match(
    /^(?:or\s+)?(have|haves|wts|want|wants|wtb)\b[\s:]*/i,
  );
  if (!match) return null;

  const section: "have" | "want" = /^(have|haves|wts)$/i.test(match[1])
    ? "have"
    : "want";
  const hasOneToOne = /\b1:1\b/.test(stripped);
  return { section, hasOneToOne, rest: stripped.slice(match[0].length).trim() };
}

function isIgnorableTradeIntentLine(line: string): boolean {
  const stripped = stripDiscordFormatting(line).toLowerCase();
  return /^(wtt|want to trade)$/.test(stripped);
}

/**
 * Traders commonly put a priced sale block after their 1:1 WANT block:
 *
 *   **WANT**
 *   ChaeWon CC301 (1:1)
 *   **CC FCO 1st & 2nd Set ($13/set)**
 *   SeoYeon CC101-CC116
 *
 * The second heading has no explicit WTS/HAVE word, but treating its following
 * cards as wants produces the backwards "You give" result. Limit this to a
 * markdown heading with a price and no collection code, so an ordinary priced
 * want line ("ChaeWon CC301 $5") remains a want.
 */
function isPricedOfferSubheading(line: string): boolean {
  const isStyledHeading =
    /^\s*#{1,3}\s+\S/.test(line) ||
    /^\s*(?:\*\*|__).+(?:\*\*|__)\s*$/.test(line);
  if (!isStyledHeading) return false;
  const stripped = stripDiscordFormatting(line);
  const hasPrice = /(?:[$￥₩]\s*\d|\b(?:usd|sgd|php|rm)\s*\d)/i.test(stripped);
  const hasCollection = /(?:[A-Za-z]{1,3}\d{3}|\b\d{3}\b)/.test(stripped);
  return hasPrice && !hasCollection;
}

/** Token is a quantity annotation like x3, x10 — returns the number or null */
function parseQuantityToken(token: string): number | null {
  const m = token.match(/^x(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Normalise the shapes real Discord trade posts use that plain whitespace
 * tokenisation would otherwise mangle. Applied per line before splitting.
 *
 *   "Sohyun D102 (×2)"        → "(x2)"     U+00D7 is common on mobile keyboards
 *   "Shion cc109x4 cc111"     → "cc109 x4" attached quantity, else the item is lost
 *   "Lynn E317 - 320 E347"    → "E317-320" spaced range; the range expander
 *                                          already handles the unspaced form
 */
function normalizeItemLine(line: string): string {
  return (
    line
      // Multiplication sign → ASCII x, so x3 / (x3) parse identically.
      .replace(/×/g, "x")
      // Collapse spaces around a range separator between two collection codes.
      .replace(
        /([A-Za-z]{0,3}\d{3}[azAZ]?)\s*[-~]\s*([A-Za-z]{0,3}\d{3}[azAZ]?)/g,
        "$1-$2",
      )
      // Detach a trailing quantity fused onto a collection code.
      .replace(/([A-Za-z]{1,3}\d{3}[azAZ]?)x(\d+)\b/gi, "$1 x$2")
  );
}

/**
 * Parse a single line within a section.
 * Returns items, errors, and any note fragments (e.g. "1:1") extracted mid-line.
 */
function parseLine(
  line: string,
  section: "have" | "want",
  inheritedMember: string | null = null,
): {
  items: ParsedItem[];
  errors: string[];
  noteFragments: string[];
  explicitMember: string | null | undefined;
} {
  let trimmed = normalizeItemLine(stripDiscordFormatting(line));
  if (!trimmed)
    return {
      items: [],
      errors: [],
      noteFragments: [],
      explicitMember: undefined,
    };

  // Strip trailing colon after first word: "Seoyeon: bb101" → "Seoyeon bb101"
  trimmed = trimmed.replace(/^(\S+):/, "$1");

  const items: ParsedItem[] = [];
  const errors: string[] = [];
  const noteFragments: string[] = [];

  // Extract "1:1" from lines that also have items — strip it and capture separately.
  // Lines that are purely notes (no items) go to trailing naturally.
  const hasOneToOne = /\b1:1\b/.test(trimmed);
  if (hasOneToOne) {
    trimmed = trimmed.replace(/\b1:1\b/g, "").trim();
  }

  if (!trimmed) {
    if (hasOneToOne) noteFragments.push("1:1");
    return { items, errors, noteFragments, explicitMember: undefined };
  }

  // Check for "Any" prefix (only meaningful in want section)
  const anyPrefixRe = /^any\s+/i;
  const isAnyLine = anyPrefixRe.test(trimmed);
  const lineWithoutAny = isAnyLine ? trimmed.replace(anyPrefixRe, "") : trimmed;

  // Split on • (bullet separator used in some posts to separate item groups)
  const bulletParts = lineWithoutAny.split("•");

  // Split by comma: "Kaede bb104, bb105, bb108" → ["Kaede bb104", "bb105", "bb108"]
  const commaParts = bulletParts
    .flatMap((bp) => bp.split(","))
    .map((p) => p.trim())
    .filter(Boolean);

  // Inherit member from previous line if this line has no leading member.
  // "Any" lines always clear the inherited member (explicit "no specific member").
  let leadingMember: string | null = isAnyLine ? null : inheritedMember;
  let explicitMember: string | null | undefined; // set only when this line names a member
  let currentSeason: string | null = null; // inherited for bare-number tokens across the line
  let activeMembers = leadingMember ? [leadingMember] : [];
  let sawCodeSinceMember = false;
  let sawMemberOnLine = false;
  let lastEmitted: ParsedItem[] = [];
  const isCollabLine = /\bS\d{1,2}\s*x\s*S\d{1,2}\b/i.test(trimmed);

  /** Emit one collection for all owners currently named ahead of it. */
  const emit = (item: Omit<ParsedItem, "member" | "raw">, label: string) => {
    const owners =
      isCollabLine || (isAnyLine && section === "want")
        ? [null]
        : activeMembers.length > 0
          ? activeMembers
          : [leadingMember];
    lastEmitted = owners.map((member) => ({
      ...item,
      member,
      raw: member ? `${member} ${label}` : label,
    }));
    items.push(...lastEmitted);
    sawCodeSinceMember = true;
  };

  for (let i = 0; i < commaParts.length; i++) {
    const part = commaParts[i];
    const tokens = part.split(/\s+/);

    for (let j = 0; j < tokens.length; j++) {
      const token = tokens[j];
      if (!token) continue;

      const memberCandidate = resolveMember(token, i === 0 && j === 0);
      if (memberCandidate) {
        // Names that arrive before a code jointly own it. A name after a code
        // starts a new group on the same line.
        if (!sawMemberOnLine || sawCodeSinceMember) {
          activeMembers = [memberCandidate];
          sawCodeSinceMember = false;
        } else {
          activeMembers = [...activeMembers, memberCandidate];
        }
        sawMemberOnLine = true;
        leadingMember = memberCandidate;
        explicitMember = memberCandidate;
        continue;
      }

      // ── Quantity: x3, x10 ────────────────────────────────────────────────
      const qty = parseQuantityToken(token);
      if (qty !== null) {
        for (const item of lastEmitted) item.quantity = qty;
        continue;
      }

      // ── Parenthetical quantity: (4), (13) — no # prefix ─────────────────
      const parenQtyMatch = token.match(/^\(x?(\d+)\)$/i);
      if (parenQtyMatch) {
        for (const item of lastEmitted)
          item.quantity = parseInt(parenQtyMatch[1], 10);
        continue;
      }

      // ── Serial token: #1, #20x, (#3x), (#20x) ───────────────────────────
      // # prefix → serial/copy number; x suffix with # → serial range e.g. #20x = ~#200–209
      const serialTokenMatch = token.match(/^(?:\(#(\d+x?)\)|#(\d+x?))$/i);
      if (serialTokenMatch) {
        const serialVal = serialTokenMatch[1] ?? serialTokenMatch[2];
        for (const item of lastEmitted) item.serial = serialVal;
        continue;
      }

      // ── Range expansion: BB117-BB120 or BB117~BB120 ──────────────────────
      const rangeMatch = token.match(
        /^([A-Za-z]*)(\d{3})[azAZ]?[-~][A-Za-z]*(\d{3})[azAZ]?$/i,
      );
      if (rangeMatch) {
        const prefix = rangeMatch[1].toUpperCase();
        const start = parseInt(rangeMatch[2], 10);
        const end = parseInt(rangeMatch[3], 10);
        const season =
          prefix && seasonPrefixMap[prefix]
            ? seasonPrefixMap[prefix]
            : currentSeason;
        if (season && end >= start && end - start < 50) {
          for (let n = start; n <= end; n++) {
            const digits = String(n).padStart(3, "0");
            emit(
              {
                season,
                collectionNo: digits,
              },
              `${prefix}${digits}`,
            );
          }
          if (prefix && seasonPrefixMap[prefix])
            currentSeason = seasonPrefixMap[prefix];
        }
        continue;
      }

      // ── Collection token with optional attached serial: BB101#1, BB101#20x ─
      let collToken = token;
      let attachedSerial: string | undefined;
      const attachedSerialMatch = token.match(/^(.+?)#(\d+x?)$/i);
      if (attachedSerialMatch && parseCollectionToken(attachedSerialMatch[1])) {
        collToken = attachedSerialMatch[1];
        attachedSerial = attachedSerialMatch[2];
      }

      const parsed = parseCollectionToken(collToken);
      if (parsed) {
        currentSeason = parsed.season;
        emit(
          {
            season: parsed.season,
            collectionNo: parsed.digits,
            ...(attachedSerial ? { serial: attachedSerial } : {}),
            ...(parsed.onOffline ? { onOffline: parsed.onOffline } : {}),
          },
          collToken,
        );
        continue;
      }

      // ── Bare 3-digit number inheriting current season ────────────────────
      // e.g. "Hayeon bb101 102 104" → 102/104 inherit Binary02
      const bareDigitsMatch = token.match(/^(\d{3})[azAZ]?$/);
      if (bareDigitsMatch && currentSeason) {
        emit(
          {
            season: currentSeason,
            collectionNo: bareDigitsMatch[1],
          },
          token,
        );
      }

      // Unknown token — skip silently (e.g. "unscanned", "available", price annotations)
    }
  }

  // Only surface "1:1" as a note fragment when it appeared alongside parseable items.
  // Standalone "1:1" lines produce no items and reach trailing notes naturally.
  if (hasOneToOne && items.length > 0) {
    noteFragments.push("1:1");
  }

  if (items.length === 0 && section === "want" && isAnyLine) {
    items.push({
      member: null,
      season: "",
      collectionNo: "",
      raw: trimmed,
      freeform: true,
    });
  }

  return { items, errors, noteFragments, explicitMember };
}

/**
 * Main entry: parse pasted text into structured have/want items.
 *
 * Section headers: HAVE / WANT / WTS (→ have) / WTB (→ want), plus multi-word variants.
 * Every non-item line is retained as a poster note without ever closing the
 * current section: traders frequently resume a list after a sentence, link or
 * subsection label.
 */
export function parsePastedTrade(text: string): ParseResult {
  const lines = text.split("\n");
  const haves: ParsedItem[] = [];
  const wants: ParsedItem[] = [];
  const errors: string[] = [];

  let currentSection: "have" | "want" | null = null;
  let lastMember: string | null = null; // inherited across lines within a section
  const noteLines: string[] = [];

  for (const line of lines) {
    let trimmed = line.trim();

    // Skip URLs — they appear as context links in trade posts, not as items
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
      continue;

    const headerResult = isSectionHeader(line);
    if (headerResult) {
      currentSection = headerResult.section;
      lastMember = null; // reset member inheritance on section change
      if (headerResult.hasOneToOne) noteLines.push("1:1");
      // "Have: Shion bb306" puts the header and the item on one line. Fall
      // through with the remainder instead of discarding it.
      if (!headerResult.rest) continue;
      trimmed = headerResult.rest;
    }

    // Blank lines are meaningful paragraph separators in notes, but a later
    // item must still be read rather than being trapped behind a footer state.
    if (!trimmed) {
      noteLines.push("");
      continue;
    }

    if (isIgnorableTradeIntentLine(line)) continue;

    // A separate, priced markdown heading after a WANT section starts a sale
    // list. See isPricedOfferSubheading for the intentionally narrow shape.
    if (
      !headerResult &&
      currentSection === "want" &&
      isPricedOfferSubheading(line)
    ) {
      currentSection = "have";
      lastMember = null;
      noteLines.push(trimmed);
      continue;
    }

    let parsedLine: ReturnType<typeof parseLine> | undefined;
    if (!currentSection) {
      // HAVE headers are often omitted after a short "WTT" opener. Only a
      // genuinely parseable collection begins an implicit HAVE section; prose
      // remains a note instead of turning every preamble into a trade list.
      parsedLine = parseLine(trimmed, "have", lastMember);
      if (parsedLine.items.length === 0) {
        noteLines.push(trimmed);
        continue;
      }
      currentSection = "have";
    }

    const lineResult: ReturnType<typeof parseLine> =
      parsedLine ?? parseLine(trimmed, currentSection, lastMember);
    const {
      items,
      errors: lineErrors,
      noteFragments,
      explicitMember,
    } = lineResult;
    if (explicitMember !== undefined) lastMember = explicitMember;

    for (const frag of noteFragments) noteLines.push(frag);
    if (items.length === 0) noteLines.push(trimmed);

    if (currentSection === "have") haves.push(...items);
    else wants.push(...items);
    errors.push(...lineErrors);
  }

  if (haves.length === 0 && wants.length === 0 && errors.length === 0) {
    errors.push(
      "No HAVE or WANT section found. Start with HAVE or WANT on its own line.",
    );
  }

  const rawNotes = noteLines.join("\n").trim() || undefined;
  const notes = rawNotes ? sanitizeNoteText(rawNotes) || undefined : undefined;

  return { haves, wants, errors, notes };
}
