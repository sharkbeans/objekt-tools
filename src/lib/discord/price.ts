import { objektKey } from "@/lib/discord/match";
import { seasonPrefixMap } from "@/lib/season-prefix";

/**
 * Prices, as structured data rather than prose.
 *
 * A trade channel is roughly a quarter sales, and for those posts the price is
 * the whole decision — but it lives in free text next to the objekt code, in
 * every shape traders type:
 *
 *   Hyerin CC336 CC337 $5.5     one price governing the line
 *   YooYeon  CC100  15$         suffix form
 *   Chaewon CC334-338 set $32   a price for the set, not each
 *   CC301 -> each 1$            explicitly per-item
 *   B320 (Copies 14) QYOP       quote your own price
 *   Each $2.3 / 3rd $2.6        a post-wide default, with no code on the line
 *
 * The last one matters most: the largest seller in a real sample states the
 * price once at the top and then lists two dozen objekts with no price on any
 * line. Reading only per-line prices shows that post as having none.
 *
 * See docs/plans/035-discord-paste-match.md.
 */

export type PriceScope =
  /** Stated on the objekt's own line. */
  | "item"
  /** Stated for a group bought together — not the unit price. */
  | "set"
  /** A post-wide default applied because the line named no price. */
  | "post";

export interface PriceTag {
  amount: number;
  /** Verbatim, so an odd currency or qualifier is never silently reshaped. */
  raw: string;
  scope: PriceScope;
}

export interface PostPricing {
  /** Objekt key -> what they are selling it for. */
  byKey: Record<string, PriceTag[]>;
  /**
   * Objekt key -> what they will pay for it.
   *
   * Kept apart from `byKey` because a price in the want section is the
   * opposite side of the trade; merging them makes a buyer look like a seller
   * and quietly halves the asking price.
   */
  wantByKey: Record<string, PriceTag[]>;
  /** Price stated for the post as a whole, applied when a line has none. */
  fallback: PriceTag | null;
  /** "Quote your own price" — the seller wants an offer, not a number. */
  qyop: boolean;
  /** Payment rails the seller named. */
  payment: string[];
}

const COLLECTION_TOKEN = /^[A-Za-z]{0,3}\d{3}[azAZ]?$/;
// The bare-number form is guarded so the "337" of "CC337 $5.5" is not a price.
const PRICE =
  /(?:\$\s*(\d+(?:[.,]\d+)?))|(?:(?<![A-Za-z\d])(\d+(?:[.,]\d+)?)\s*\$)/g;
const SET_WORD = /\bset\b/i;
const QYOP = /\bqyop\b/i;

const PAYMENT_RAILS: [RegExp, string][] = [
  [/\bpaypal\b/i, "PayPal"],
  [/\b(f&f|fnf)\b/i, "PayPal F&F"],
  [/\b(g&s|gns)\b/i, "PayPal G&S"],
  [/\bwise\b/i, "Wise"],
  [/\bpaypay\b/i, "PayPay"],
  [/\bpayoneer\b/i, "Payoneer"],
  [/\bvenmo\b/i, "Venmo"],
  [/\bgcash\b/i, "GCash"],
  [/\bpaymaya\b/i, "PayMaya"],
  [/\balipay\b/i, "Alipay"],
  [/\bwechat\s*pay\b/i, "WeChat Pay"],
  [/\b(kr\s*bank|krbank|korean\s*bank)\b/i, "KR bank"],
  [/\bina\s*bank\b/i, "INA bank"],
];

function parseAmount(text: string): number | null {
  const n = Number.parseFloat(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Every price on one line, in order. */
function pricesOnLine(line: string): { amount: number; raw: string }[] {
  const out: { amount: number; raw: string }[] = [];
  PRICE.lastIndex = 0;
  let m = PRICE.exec(line);
  while (m) {
    const amount = parseAmount(m[1] ?? m[2] ?? "");
    if (amount !== null) out.push({ amount, raw: m[0].trim() });
    m = PRICE.exec(line);
  }
  return out;
}

/** Collection codes on a line, with `E317-E320` expanded to its members. */
function codesOnLine(tokens: string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    const t = token.replace(/[.,:;()]+$/, "");
    if (COLLECTION_TOKEN.test(t)) {
      out.push(t);
      continue;
    }
    // "E317-E320", "CC334-338", "bb201-bb204" — a set line still names
    // objekts, and treating it as nameless made its price look like the
    // post's headline price.
    const range = t.match(
      /^([A-Za-z]{0,3})(\d{3})[azAZ]?-([A-Za-z]{0,3})(\d{3})[azAZ]?$/,
    );
    if (!range) continue;
    const prefix = range[1] || range[3];
    const from = Number.parseInt(range[2], 10);
    const to = Number.parseInt(range[4], 10);
    if (to < from || to - from > 40) continue;
    for (let n = from; n <= to; n++) out.push(`${prefix}${n}`);
  }
  return out;
}

export function extractPricing(
  body: string,
  memberNames: string[],
): PostPricing {
  const members = new Set(memberNames.map((n) => n.toLowerCase()));
  const byKey: Record<string, PriceTag[]> = {};
  const wantByKey: Record<string, PriceTag[]> = {};
  let fallback: PriceTag | null = null;
  let section: "have" | "want" = "have";

  const payment = PAYMENT_RAILS.flatMap(([re, label]) =>
    re.test(body) ? [label] : [],
  );

  let lastMember: string | null = null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("http")) continue;

    // Which side of the post are we on? A price under WANT is what they will
    // pay, not what they charge.
    if (/^(have|haves|wts)\b/i.test(line)) section = "have";
    else if (/^(want|wants|wtb)\b/i.test(line)) section = "want";

    const tokens = line.split(/[\s,]+/).filter(Boolean);
    const named = tokens.find((t) =>
      members.has(t.toLowerCase().replace(/[.:;()]+$/, "")),
    );
    if (named) lastMember = named.replace(/[.:;()]+$/, "");

    // "Any CC201 CC202 (price / 4$)" names no member. Letting it inherit the
    // one from an earlier line invents a bid for a trader who was never
    // mentioned, so an ANY line only prices what it names itself.
    const anyLine = /^any\b/i.test(line);
    if (anyLine && !named) {
      continue;
    }

    const prices = pricesOnLine(line);
    if (prices.length === 0) continue;

    const codes = codesOnLine(tokens);

    // A price with no objekt on the line is a statement about the whole post
    // ("Each $2.3", "WTS SCO 2$ each"). Keep the first — later lines are
    // usually tier variations ("3rd 3$") rather than a new headline price.
    if (codes.length === 0 || !lastMember) {
      if (!fallback && section === "have") {
        fallback = {
          amount: prices[0].amount,
          raw: prices[0].raw,
          scope: "post",
        };
      }
      continue;
    }

    const target = section === "want" ? wantByKey : byKey;

    // The first price governs the line; a trailing one is normally a variant
    // ("Divine FCO 2.5$ (3rd 3$)").
    const scope: PriceScope = SET_WORD.test(line) ? "set" : "item";
    const tag: PriceTag = {
      amount: prices[0].amount,
      raw: prices[0].raw,
      scope,
    };

    for (const code of codes) {
      const cleaned = code.replace(/[.,:;()]+$/, "");
      const match = cleaned.match(/^([A-Za-z]{0,3})(\d{3})([azAZ]?)$/);
      if (!match) continue;
      const season = seasonPrefixMap[match[1].toUpperCase()];
      if (!season) continue;
      const key = objektKey({
        member: lastMember,
        season,
        collectionNo: match[2] + match[3],
      });
      if (!key) continue;
      const bucket = target[key];
      if (bucket) {
        if (
          !bucket.some((p) => p.amount === tag.amount && p.scope === tag.scope)
        )
          bucket.push(tag);
      } else {
        target[key] = [tag];
      }
    }
  }

  return { byKey, wantByKey, fallback, qyop: QYOP.test(body), payment };
}

/** Cheapest stated unit price, ignoring set prices. Null when only a set. */
export function unitPrice(tags: PriceTag[] | undefined): PriceTag | null {
  if (!tags || tags.length === 0) return null;
  const units = tags.filter((t) => t.scope !== "set");
  if (units.length === 0) return null;
  return units.reduce((a, b) => (b.amount < a.amount ? b : a));
}

/** Display form: "$5.50", or the raw text when it carried something else. */
export function formatPrice(tag: PriceTag): string {
  return `$${tag.amount % 1 === 0 ? tag.amount : tag.amount.toFixed(2)}`;
}

/**
 * What this poster wants for an objekt.
 *
 * Falls back to the post-wide price, because a seller who writes "Each $2.3"
 * once and then lists two dozen objekts has priced every one of them.
 */
export function askingPrice(
  pricing: PostPricing,
  key: string,
): PriceTag | null {
  return unitPrice(pricing.byKey[key]) ?? pricing.fallback;
}

/** What this poster will pay for an objekt, when they said. */
export function bidPrice(pricing: PostPricing, key: string): PriceTag | null {
  return unitPrice(pricing.wantByKey[key]);
}
