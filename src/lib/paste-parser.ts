/**
 * Paste-to-trade parser
 *
 * Supports two community formats:
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
 */

import { shortformMembers, membersByArtist } from "@/lib/filters";

const allMembers = Object.values(membersByArtist).flat();

const seasonPrefixMap: Record<string, string> = {
  A: "Atom01",
  AA: "Atom02",
  B: "Binary01",
  BB: "Binary02",
  C: "Cream01",
  D: "Divine01",
  E: "Ever01",
  W: "Winter26",
  SP: "Spring25",
  SU: "Summer25",
  AU: "Autumn25",
};

export interface ParsedItem {
  member: string | null; // resolved member name, null for "any member" wants
  season: string; // resolved season e.g. "Binary02"
  collectionNo: string; // raw digits e.g. "345"
  raw: string; // original text for error display
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

// Matches a season-prefix + 3-digit collection number, optional trailing a/z
const collectionRe = /^([A-Za-z]*)(\d{3})[azAZ]?$/i;

interface ParsedCollection {
  season: string;
  digits: string;
}

function parseCollectionToken(token: string): ParsedCollection | null {
  const m = token.match(collectionRe);
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const digits = m[2];
  const season = prefix ? seasonPrefixMap[prefix] : null;
  if (prefix && !season) return null; // unknown prefix
  if (!season) return null; // bare digits without prefix not enough
  return { season, digits };
}

/**
 * Strip Discord/Markdown formatting from a line before checking if it's a header.
 * Handles: ## Have, **Have**, [Have], [H], **[Have]**, etc.
 */
function stripFormatting(line: string): string {
  return line
    .trim()
    .replace(/^#+\s*/, "")       // ## heading
    .replace(/\*\*/g, "")        // **bold**
    .replace(/[[\]]/g, "")       // [brackets]
    .trim();
}

/** Detect HAVE/WANT section header */
function isSectionHeader(line: string): "have" | "want" | null {
  const stripped = stripFormatting(line).toLowerCase();
  if (/^(have|haves|h)$/.test(stripped)) return "have";
  if (/^(want|wants|w)$/.test(stripped)) return "want";
  return null;
}

/** Token is a quantity annotation like x3, x10 — skip silently */
function isQuantityToken(token: string): boolean {
  return /^x\d+$/i.test(token);
}

/**
 * Parse a single line within a section.
 * Returns an array because grouped format can produce multiple items per line.
 *
 * Handles:
 *   "SeoYeon AA201"           → 1 item
 *   "Kaede bb104, bb105"      → 2 items
 *   "Any bb343 bb344 bb345"   → 3 items (member=null for wants)
 *   "bb345"                   → 1 item (no member)
 */
function parseLine(
  line: string,
  section: "have" | "want",
): { items: ParsedItem[]; errors: string[] } {
  const trimmed = line.trim();
  if (!trimmed) return { items: [], errors: [] };

  const items: ParsedItem[] = [];
  const errors: string[] = [];

  // Check for "Any" prefix (only meaningful in want section)
  const anyPrefixRe = /^any\s+/i;
  const isAnyLine = anyPrefixRe.test(trimmed);
  const lineWithoutAny = isAnyLine ? trimmed.replace(anyPrefixRe, "") : trimmed;

  // Split by comma first to handle grouped format: "Kaede bb104, bb105, bb108"
  const commaParts = lineWithoutAny.split(",").map((p) => p.trim()).filter(Boolean);

  // Try to extract a leading member name from the first comma-part
  // e.g. "Kaede bb104" → member="Kaede", collection="bb104"
  // e.g. "bb104"       → member=null, collection="bb104"

  let leadingMember: string | null = null;

  for (let i = 0; i < commaParts.length; i++) {
    const part = commaParts[i];
    const tokens = part.split(/\s+/);

    // Each comma-part: first token may be a member name, rest are collection numbers
    // Or all tokens are collection numbers (no member)
    let startIndex = 0;
    if (i === 0) {
      const memberCandidate = resolveMember(tokens[0]);
      if (memberCandidate) {
        leadingMember = memberCandidate;
        startIndex = 1;
      }
    }

    // If after checking member there are no collection tokens in this part, continue
    // (member-only first part, collections come in subsequent comma-parts)
    if (startIndex === tokens.length) continue;

    for (let j = startIndex; j < tokens.length; j++) {
      const token = tokens[j];
      // Skip quantity annotations (x3, x10) and unrecognized words silently
      if (isQuantityToken(token)) continue;
      const parsed = parseCollectionToken(token);
      if (parsed) {
        items.push({
          member: isAnyLine && section === "want" ? null : leadingMember,
          season: parsed.season,
          collectionNo: parsed.digits,
          raw: leadingMember ? `${leadingMember} ${token}` : token,
        });
      } else if (!resolveMember(token)) {
        // Unknown word that's not a member name — skip silently (e.g. "unscanned", "available")
      }
    }
  }

  return { items, errors };
}

/**
 * Main entry: parse pasted text into structured have/want items.
 *
 * Any trailing lines after the last HAVE/WANT section that yield no parseable
 * items are collected as optional `notes` (e.g. "(3:1) dm and ping 📩").
 */
export function parsePastedTrade(text: string): ParseResult {
  const lines = text.split("\n");
  const haves: ParsedItem[] = [];
  const wants: ParsedItem[] = [];
  const errors: string[] = [];

  let currentSection: "have" | "want" | null = null;

  // Track trailing unparseable lines to extract as notes
  const trailingUnparseable: string[] = [];
  let inFooter = false; // once we hit the first unparseable line, start collecting with blank lines

  for (const line of lines) {
    const header = isSectionHeader(line);
    if (header) {
      currentSection = header;
      trailingUnparseable.length = 0;
      inFooter = false;
      continue;
    }

    const trimmed = line.trim();

    // Once in footer, preserve blank lines for spacing
    if (inFooter) {
      trailingUnparseable.push(trimmed);
      continue;
    }

    if (!trimmed) continue;

    if (!currentSection) {
      // Skip non-parseable lines before any header
      continue;
    }

    const { items, errors: lineErrors } = parseLine(trimmed, currentSection);
    if (items.length > 0) {
      trailingUnparseable.length = 0; // reset — this was a valid line
    } else {
      inFooter = true;
      trailingUnparseable.push(trimmed); // no items parsed → start of footer/notes
    }

    if (currentSection === "have") {
      haves.push(...items);
    } else {
      wants.push(...items);
    }
    errors.push(...lineErrors);
  }

  if (haves.length === 0 && wants.length === 0 && errors.length === 0) {
    errors.push("No HAVE or WANT section found. Start with HAVE or WANT on its own line.");
  }

  const notes = trailingUnparseable.length > 0
    ? trailingUnparseable.join("\n").trim()
    : undefined;

  return { haves, wants, errors, notes };
}
