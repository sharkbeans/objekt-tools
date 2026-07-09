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
}

export interface ParseResult {
  haves: ParsedItem[];
  wants: ParsedItem[];
  errors: string[];
  notes?: string;
}

/** Case-insensitive member resolve: shortform → full name, or exact match */
function resolveMember(text: string): string | null {
  const lower = text.toLowerCase();
  const shortform = shortformMembers[lower];
  if (shortform) return shortform;
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
function isSectionHeader(
  line: string,
): { section: "have" | "want"; hasOneToOne: boolean } | null {
  const stripped = stripDiscordFormatting(line);
  const lower = stripped.toLowerCase();

  // Single-letter shorthands [H], [W]
  if (lower === "h") return { section: "have", hasOneToOne: false };
  if (lower === "w") return { section: "want", hasOneToOne: false };

  let section: "have" | "want" | null = null;
  if (/^(have|haves|wts)\b/i.test(lower)) section = "have";
  else if (/^(want|wants|wtb)\b/i.test(lower)) section = "want";

  if (!section) return null;

  const hasOneToOne = /\b1:1\b/.test(stripped);
  return { section, hasOneToOne };
}

function isIgnorableTradeIntentLine(line: string): boolean {
  const stripped = stripDiscordFormatting(line).toLowerCase();
  return /^(wtt|want to trade)$/.test(stripped);
}

/** Token is a quantity annotation like x3, x10 — returns the number or null */
function parseQuantityToken(token: string): number | null {
  const m = token.match(/^x(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
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
  let trimmed = stripDiscordFormatting(line);
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

  for (let i = 0; i < commaParts.length; i++) {
    const part = commaParts[i];
    const tokens = part.split(/\s+/);

    let startIndex = 0;
    if (i === 0) {
      const memberCandidate = resolveMember(tokens[0]);
      if (memberCandidate) {
        leadingMember = memberCandidate;
        explicitMember = memberCandidate;
        startIndex = 1;
      }
    }

    // Member-only first part; collections follow in subsequent comma-parts
    if (startIndex === tokens.length) continue;

    for (let j = startIndex; j < tokens.length; j++) {
      const token = tokens[j];
      if (!token) continue;

      // ── Quantity: x3, x10 ────────────────────────────────────────────────
      const qty = parseQuantityToken(token);
      if (qty !== null) {
        if (items.length > 0) items[items.length - 1].quantity = qty;
        continue;
      }

      // ── Parenthetical quantity: (4), (13) — no # prefix ─────────────────
      const parenQtyMatch = token.match(/^\((\d+)\)$/);
      if (parenQtyMatch) {
        if (items.length > 0)
          items[items.length - 1].quantity = parseInt(parenQtyMatch[1], 10);
        continue;
      }

      // ── Serial token: #1, #20x, (#3x), (#20x) ───────────────────────────
      // # prefix → serial/copy number; x suffix with # → serial range e.g. #20x = ~#200–209
      const serialTokenMatch = token.match(/^(?:\(#(\d+x?)\)|#(\d+x?))$/i);
      if (serialTokenMatch) {
        const serialVal = serialTokenMatch[1] ?? serialTokenMatch[2];
        if (items.length > 0) items[items.length - 1].serial = serialVal;
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
            items.push({
              member: isAnyLine && section === "want" ? null : leadingMember,
              season,
              collectionNo: digits,
              raw: leadingMember
                ? `${leadingMember} ${prefix}${digits}`
                : `${prefix}${digits}`,
            });
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
        items.push({
          member: isAnyLine && section === "want" ? null : leadingMember,
          season: parsed.season,
          collectionNo: parsed.digits,
          raw: leadingMember ? `${leadingMember} ${collToken}` : collToken,
          ...(attachedSerial ? { serial: attachedSerial } : {}),
          ...(parsed.onOffline ? { onOffline: parsed.onOffline } : {}),
        });
        continue;
      }

      // ── Bare 3-digit number inheriting current season ────────────────────
      // e.g. "Hayeon bb101 102 104" → 102/104 inherit Binary02
      const bareDigitsMatch = token.match(/^(\d{3})[azAZ]?$/);
      if (bareDigitsMatch && currentSeason) {
        items.push({
          member: isAnyLine && section === "want" ? null : leadingMember,
          season: currentSeason,
          collectionNo: bareDigitsMatch[1],
          raw: leadingMember ? `${leadingMember} ${token}` : token,
        });
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
 * Any trailing lines after the last parseable line are collected as poster notes.
 * Preamble lines (before any header) are also included in notes.
 */
export function parsePastedTrade(text: string): ParseResult {
  const lines = text.split("\n");
  const haves: ParsedItem[] = [];
  const wants: ParsedItem[] = [];
  const errors: string[] = [];

  let currentSection: "have" | "want" | null = null;
  let lastMember: string | null = null; // inherited across lines within a section

  const preambleLines: string[] = [];
  const trailingUnmatched: string[] = [];
  let inFooter = false;

  // Deduplicated note fragments extracted mid-parse (e.g. "1:1" from headers/lines)
  const extractedNoteFragments = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip URLs — they appear as context links in trade posts, not as items
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
      continue;

    const headerResult = isSectionHeader(line);
    if (headerResult) {
      currentSection = headerResult.section;
      lastMember = null; // reset member inheritance on section change
      if (headerResult.hasOneToOne) extractedNoteFragments.add("1:1");
      trailingUnmatched.length = 0;
      inFooter = false;
      continue;
    }

    // Once in footer, collect everything (including blanks) as trailing notes
    if (inFooter) {
      trailingUnmatched.push(trimmed);
      continue;
    }

    if (!trimmed) continue;

    if (isIgnorableTradeIntentLine(line)) continue;

    if (!currentSection) {
      preambleLines.push(trimmed);
      continue;
    }

    const {
      items,
      errors: lineErrors,
      noteFragments,
      explicitMember,
    } = parseLine(trimmed, currentSection, lastMember);
    if (explicitMember !== undefined) lastMember = explicitMember;

    for (const frag of noteFragments) extractedNoteFragments.add(frag);

    if (items.length > 0) {
      trailingUnmatched.length = 0;
      inFooter = false; // reset — subsection labels between items no longer kill parsing
    } else {
      inFooter = true;
      trailingUnmatched.push(trimmed);
    }

    if (currentSection === "have") haves.push(...items);
    else wants.push(...items);
    errors.push(...lineErrors);
  }

  if (haves.length === 0 && wants.length === 0 && errors.length === 0) {
    errors.push(
      "No HAVE or WANT section found. Start with HAVE or WANT on its own line.",
    );
  }

  // Build notes: preamble + extracted fragments + trailing unparseable lines
  const noteParts: string[] = [];
  if (preambleLines.length > 0) noteParts.push(preambleLines.join("\n").trim());
  if (extractedNoteFragments.size > 0)
    noteParts.push([...extractedNoteFragments].join(", "));
  if (trailingUnmatched.length > 0) {
    const trailing = trailingUnmatched.join("\n").trim();
    if (trailing) noteParts.push(trailing);
  }

  const rawNotes =
    noteParts.length > 0 ? noteParts.join("\n\n").trim() : undefined;
  const notes = rawNotes ? sanitizeNoteText(rawNotes) || undefined : undefined;

  return { haves, wants, errors, notes };
}
