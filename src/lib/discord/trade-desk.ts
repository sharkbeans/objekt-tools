import { objektKey } from "@/lib/discord/match";
import type { MessageTime, TranscriptMessage } from "@/lib/discord/transcript";
import { formatSeasonNumberLabel, formatShortLabel } from "@/lib/objekt-label";
import type { ParsedItem } from "@/lib/paste-parser";

export type DeskMode = "wtt" | "wtb" | "wts";

export function deskLabel(item: ParsedItem): string {
  return formatShortLabel({ ...item, collectionId: "" });
}

/**
 * A card's name as two lines: member, then code.
 *
 * On one line, "SeoYeon E317" fits a card's width and "SeoYeon CC203" wraps,
 * so a row of cards came out at two different heights. A label with no member
 * keeps its one line and an empty second one, for the same reason.
 */
export function deskLabelLines(item: ParsedItem): [string, string] {
  if (!item.member || !item.collectionNo) return [deskLabel(item), ""];
  return [item.member, formatSeasonNumberLabel({ ...item, collectionId: "" })];
}

export function keyedItems(items: ParsedItem[]): Map<string, ParsedItem> {
  const map = new Map<string, ParsedItem>();
  for (const item of items) {
    const key = objektKey(item);
    if (key && !item.isAny && !item.freeform && !map.has(key))
      map.set(key, item);
  }
  return map;
}

export interface DeskPost {
  message: TranscriptMessage;
  haves: Map<string, ParsedItem>;
  wants: Map<string, ParsedItem>;
  /** Earlier posts by the same trader this one replaced. See `latestDeskPosts`. */
  replaced: number;
}

export function indexDeskPosts(messages: TranscriptMessage[]): DeskPost[] {
  return messages.map((message) => ({
    message,
    haves: keyedItems(message.haves),
    wants: keyedItems(message.wants),
    replaced: 0,
  }));
}

/**
 * Share of cards two posts have in common for the later to count as an update
 * of the earlier. An edited list changes a few cards out of many; a list split
 * across two messages, or two unrelated lists, share next to none.
 */
const SAME_LIST = 0.5;

/** Jaccard overlap of both legs, so a card moved from have to want differs. */
function listOverlap(a: DeskPost, b: DeskPost): number {
  const keys = (post: DeskPost) =>
    new Set([
      ...[...post.haves.keys()].map((key) => `have:${key}`),
      ...[...post.wants.keys()].map((key) => `want:${key}`),
    ]);
  const left = keys(a);
  const right = keys(b);
  let shared = 0;
  for (const key of left) if (right.has(key)) shared++;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Whether `a` was certainly posted after `b`.
 *
 * Only when the order is beyond doubt, because getting it wrong hides the
 * trader's current list behind their old one: two full dates (the extension's
 * ISO stamps, or a dated Discord header), or two clock times under the same
 * day word — "Today at 9:00 AM" and "Yesterday at 11:00 PM" compare the wrong
 * way round on minutes alone.
 */
function postedAfter(a: MessageTime, b: MessageTime): boolean {
  const date = (time: MessageTime) =>
    /\d{4}/.test(time.raw) ? Date.parse(time.raw) : Number.NaN;
  const left = date(a);
  const right = date(b);
  if (Number.isFinite(left) && Number.isFinite(right)) return left > right;
  const day = (time: MessageTime) =>
    time.raw
      .replace(/\d{1,2}:\d{2}(?::\d{2})?\s*([AaPp][Mm])?/, "")
      .trim()
      .toLowerCase();
  if (a.minutes === null || b.minutes === null || day(a) !== day(b))
    return false;
  return a.minutes > b.minutes;
}

/**
 * Drop posts a trader has since replaced with an updated list.
 *
 * Identical reposts are already one message (`repeats`). An *edited* repost —
 * the same list with a card traded away or added — is a new message, so the
 * same trader appeared several times over in the contacts and was counted as
 * several traders on every card they listed. A later post by the same author,
 * with an intent in common and at least half its cards in common, replaces the
 * earlier one; anything less certain keeps both, since hiding a trader's other
 * list loses a trade and showing it twice only costs a scroll.
 *
 * Nothing is merged: an offer stays within the one post that makes it, the
 * rule `selectDeskPosts` holds to.
 */
export function latestDeskPosts(posts: DeskPost[]): DeskPost[] {
  const byAuthor = new Map<string, DeskPost[]>();
  for (const post of posts) {
    const group = byAuthor.get(post.message.author);
    if (group) group.push(post);
    else byAuthor.set(post.message.author, [post]);
  }
  const replacedBy = new Map<DeskPost, DeskPost>();
  for (const group of byAuthor.values()) {
    if (group.length < 2) continue;
    for (const older of group) {
      const olderTime = older.message.time;
      if (!olderTime) continue;
      let newest: DeskPost | null = null;
      let newestTime: MessageTime | null = null;
      for (const newer of group) {
        const time = newer.message.time;
        if (newer === older || !time || !postedAfter(time, olderTime)) continue;
        if (
          !newer.message.intent.intents.some((intent) =>
            older.message.intent.intents.includes(intent),
          ) ||
          listOverlap(newer, older) < SAME_LIST
        )
          continue;
        if (!newestTime || postedAfter(time, newestTime)) {
          newest = newer;
          newestTime = time;
        }
      }
      if (newest) replacedBy.set(older, newest);
    }
  }
  // Each replacement is strictly later, so following them always ends.
  const replaced = new Map<DeskPost, number>();
  for (const [, first] of replacedBy) {
    let survivor = first;
    for (let next = replacedBy.get(survivor); next; next = replacedBy.get(next))
      survivor = next;
    replaced.set(survivor, (replaced.get(survivor) ?? 0) + 1);
  }
  return posts
    .filter((post) => !replacedBy.has(post))
    .map((post) => {
      const count = replaced.get(post);
      return count ? { ...post, replaced: count } : post;
    });
}

function containsEvery(
  items: ReadonlyMap<string, ParsedItem>,
  keys: ReadonlySet<string>,
) {
  for (const key of keys) if (!items.has(key)) return false;
  return true;
}

/**
 * Both legs must occur in the same post. Never join a want from Alice with an
 * offer from Bob (or even a different, possibly stale post by Alice).
 * Multiple selected collections mean ALL, not an implicit bundle valuation.
 */
export function selectDeskPosts(
  posts: DeskPost[],
  mode: DeskMode,
  give: ReadonlySet<string>,
  get: ReadonlySet<string>,
): DeskPost[] {
  const intent = mode === "wtb" ? "wts" : mode === "wts" ? "wtb" : "wtt";
  return posts.filter(
    (post) =>
      post.message.intent.intents.includes(intent) &&
      (mode === "wtb" || containsEvery(post.wants, give)) &&
      (mode === "wts" || containsEvery(post.haves, get)),
  );
}

export interface DeskCard {
  key: string;
  item: ParsedItem;
  posts: DeskPost[];
}

/** The grid and contact results share the very same eligible posts. */
export function collectDeskCards(
  posts: DeskPost[],
  side: "haves" | "wants",
): Map<string, DeskCard> {
  const cards = new Map<string, DeskCard>();
  for (const post of posts) {
    for (const [key, item] of post[side]) {
      const existing = cards.get(key);
      if (existing) existing.posts.push(post);
      else cards.set(key, { key, item, posts: [post] });
    }
  }
  return cards;
}
