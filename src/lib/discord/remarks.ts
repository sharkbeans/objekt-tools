import { objektKey } from "@/lib/discord/match";
import { seasonPrefixMap } from "@/lib/season-prefix";

/**
 * Per-objekt remarks — the conditions attached to a listing.
 *
 * Trade posts carry qualifiers the item parser has no place for, and they
 * change whether a trade is worth attempting:
 *
 *   NaKyoung d202(for tripleS sco only,no aa,no 3rd,prio HyeRin,YuBin,Sullin)
 *   DaHyun b205 (for sco offers) d206 d329
 *   dahyun CC101 CC102 ... (prio for grid set)
 *   Hyerin CC336 CC337 $5.5
 *   xinyu cc336 (unscanned)
 *
 * Dropping these leaves a match that looks clean and is not. They are keyed to
 * the objekts on the same line and surfaced only when a viewer opens an
 * objekt's detail, so the grid stays readable.
 *
 * Line-level rather than token-level on purpose: "(for sco offers)" sits after
 * the first of four codes but plainly governs the line, and attaching it to
 * every objekt on that line is the reading a human gives it.
 */

export interface ObjektRemark {
  /** Objekt key, as produced by `objektKey`. */
  key: string;
  /** The qualifier text, verbatim from the poster. */
  text: string;
}

const COLLECTION_TOKEN = /^[A-Za-z]{0,3}\d{3}[azAZ]?$/;
const RANGE_TOKEN = /^[a-z]{0,3}\d{3}[az]?-[a-z]{0,3}\d{3}[az]?$/i;
const PRICE_ONLY = /^(?:\$\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\$)$/;
const SECTION_WORD = /^(have|haves|want|wants|wts|wtb|wtt)$/;
const SEPARATOR = /^[-~:/&+*]+$/;

const SEASON_PREFIXES = new Set(
  Object.keys(seasonPrefixMap).map((p) => p.toLowerCase()),
);

/**
 * Strip the parts of a line the item parser already consumed, leaving the
 * qualifier. Returns "" when nothing meaningful is left.
 *
 * Order is preserved so the remark reads the way the poster wrote it.
 */
export function lineRemark(line: string, memberNames: Set<string>): string {
  const kept: string[] = [];

  // Parenthesised groups are single tokens — they hold commas and member names
  // that would otherwise be filtered away mid-phrase.
  for (const segment of line.split(/(\([^)]*\))/)) {
    if (!segment) continue;

    if (segment.startsWith("(") && segment.endsWith(")")) {
      const inner = segment.slice(1, -1).trim();
      // "(8)", "(x2)", "(#10)", "(Copies 14)" are quantities and serials.
      if (
        inner &&
        !/^[#x]?\s*\d+$/i.test(inner) &&
        !/^copies\s+\d+$/i.test(inner)
      ) {
        kept.push(inner);
      }
      continue;
    }

    // Join "$ 5.5" so a price survives the whitespace split as one token.
    for (const token of segment.replace(/\$\s+(?=\d)/g, "$").split(/[\s,]+/)) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      // A price is the one numeric token worth keeping.
      if (PRICE_ONLY.test(trimmed)) {
        kept.push(trimmed);
        continue;
      }
      const lower = trimmed.toLowerCase().replace(/[.:;]+$/, "");
      if (!lower) continue;
      if (memberNames.has(lower)) continue;
      if (SEASON_PREFIXES.has(lower)) continue;
      if (COLLECTION_TOKEN.test(lower)) continue;
      if (RANGE_TOKEN.test(lower)) continue;
      if (SECTION_WORD.test(lower)) continue;
      if (/^x\d+$/i.test(lower)) continue;
      if (lower.startsWith("#")) continue;
      if (SEPARATOR.test(lower)) continue;
      if (lower === "set" || lower === "and") continue;
      kept.push(trimmed);
    }
  }

  return kept.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Walk a post body and attach each line's qualifier to the objekts named on
 * that line.
 *
 * Runs over the raw body rather than the parsed items because the qualifier is
 * exactly the text the parser threw away.
 */
export function extractRemarks(
  body: string,
  memberNames: string[],
): Map<string, string[]> {
  const members = new Set(memberNames.map((m) => m.toLowerCase()));
  const byKey = new Map<string, string[]>();

  let lastMember: string | null = null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("http")) continue;

    // Which member does this line concern? Codes inherit the member named on
    // the line, falling back to the last one seen — the same rule the item
    // parser uses for "Mayu CC103 CC104".
    const tokens = line.split(/[\s,]+/).filter(Boolean);
    const named = tokens.find((t) =>
      members.has(t.toLowerCase().replace(/[.:;()]+$/, "")),
    );
    if (named) lastMember = named.replace(/[.:;()]+$/, "");
    const member = lastMember;
    if (!member) continue;

    const codes = tokens.filter((t) =>
      COLLECTION_TOKEN.test(t.replace(/[.,:;()]+$/, "")),
    );
    if (codes.length === 0) continue;

    const remark = lineRemark(line, members);
    if (!remark) continue;

    for (const code of codes) {
      const cleaned = code.replace(/[.,:;()]+$/, "");
      const match = cleaned.match(/^([A-Za-z]{0,3})(\d{3})([azAZ]?)$/);
      if (!match) continue;
      const season = seasonPrefixMap[match[1].toUpperCase()];
      if (!season) continue;
      const key = objektKey({
        member,
        season,
        collectionNo: match[2] + match[3],
      });
      if (!key) continue;
      const bucket = byKey.get(key);
      if (bucket) {
        if (!bucket.includes(remark)) bucket.push(remark);
      } else {
        byKey.set(key, [remark]);
      }
    }
  }

  return byKey;
}
