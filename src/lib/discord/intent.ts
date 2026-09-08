import type { ParseResult } from "@/lib/paste-parser";

/**
 * What a poster is actually proposing: a swap, a sale, a purchase — or several
 * at once.
 *
 * A trade channel is not only trades. In a real 22-poster sample, roughly a
 * quarter were selling for money and one was buying, and four posts were more
 * than one of those at the same time ("WTT WTS QR", "WTS, WTT", a HAVE/WANT
 * block followed by its own WTS and WTB blocks).
 *
 * That mix is why this is a set of flags on the existing post rather than a
 * separate non-trade section: splitting by intent would force mixed posts into
 * one bucket or duplicate them into two, and the matching maths is identical
 * either way — only the consideration differs. Callers filter on these flags.
 *
 * See docs/plans/035-discord-paste-match.md.
 */

export type TradeIntent = "wtt" | "wts" | "wtb";

export interface IntentSignals {
  intents: TradeIntent[];
  /** Prices or payment rails appear in the post. */
  money: boolean;
  /** The poster asked for money rather than objekts in their want section. */
  wantsMoney: boolean;
}

// Payment rails traders name. Presence of any of these means money is on the
// table even when no "WTS" token appears ("QUITTING SALE / PayPal / WISE").
const PAYMENT =
  /\b(paypal|pp\s*f&f|fnf|gns|g&s|wise|payoneer|venmo|gcash|paymaya|alipay|wechat\s*pay|paypay|kr\s*bank|krbank|korean\s*bank|ina\s*bank|bank\s*transfer|qyop)\b/i;

// "$5.5", "12$", "$1.50" — a price tag anywhere in the body. The fullwidth ＄
// is what CJK keyboards emit and appears throughout real posts.
const PRICE = /(?:[$＄]\s*\d+(?:[.,]\d+)?)|(?:\d+(?:[.,]\d+)?\s*[$＄])/;

const SELL_TOKEN = /\b(wts|selling|sale|for\s+sale|qyop)\b/i;
const BUY_TOKEN = /\b(wtb|buying|looking\s+to\s+buy)\b/i;
const TRADE_TOKEN = /\b(wtt|want\s+to\s+trade|trading)\b/i;

// The want section of a seller: "Money $$$ Paypal, Krbank", "$", "Offer DM".
const MONEY_WANT = /\b(money|cash|\$+|paypal|wise|offer)\b/i;

/**
 * Classify a post from its raw body plus what the parser made of it.
 *
 * Deliberately generous: a post can carry every flag. Precision matters less
 * than never hiding a post from someone who filtered for the thing it is.
 */
export function classifyIntent(
  body: string,
  parsed: Pick<ParseResult, "haves" | "wants">,
): IntentSignals {
  const money = PAYMENT.test(body) || PRICE.test(body);
  const intents = new Set<TradeIntent>();

  if (SELL_TOKEN.test(body) || money) intents.add("wts");
  if (BUY_TOKEN.test(body)) intents.add("wtb");
  if (TRADE_TOKEN.test(body)) intents.add("wtt");

  // A post with both sides filled in is a swap offer whether or not it says
  // so — most don't bother with the acronym. Headers count even with no items
  // parsed: a link-only trader writes "HAVE <link> / WANT <link>".
  const hasBothSections =
    /^\s*(have|haves)\b/im.test(body) && /^\s*(want|wants)\b/im.test(body);
  if ((parsed.haves.length > 0 && parsed.wants.length > 0) || hasBothSections)
    intents.add("wtt");

  // "Want: Money $$$ Paypal" is a sale, and the empty want list it leaves
  // behind would otherwise read as a trader who wants nothing.
  const wantSection = wantBlock(body);
  const wantsMoney =
    wantSection !== null &&
    parsed.wants.length === 0 &&
    MONEY_WANT.test(wantSection);
  if (wantsMoney) {
    intents.add("wts");
    intents.delete("wtt");
  }

  // Nothing matched but they listed objekts — assume a swap rather than
  // dropping them out of every filter.
  if (intents.size === 0 && parsed.haves.length > 0) intents.add("wtt");

  return {
    intents: (["wtt", "wts", "wtb"] as const).filter((i) => intents.has(i)),
    money,
    wantsMoney,
  };
}

/** Text between a WANT header and the next blank-line gap, if there is one. */
function wantBlock(body: string): string | null {
  const lines = body.split("\n");
  const start = lines.findIndex((l) =>
    /^\s*(want|wants|wtb)\b[\s:]*$/i.test(l.trim()),
  );
  if (start === -1) return null;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (!lines[i].trim() && out.length > 0) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

export const INTENT_LABEL: Record<TradeIntent, string> = {
  wtt: "Trade",
  wts: "Sells",
  wtb: "Buys",
};
