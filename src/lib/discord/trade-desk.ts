import { objektKey } from "@/lib/discord/match";
import type { TranscriptMessage } from "@/lib/discord/transcript";
import { formatShortLabel } from "@/lib/objekt-label";
import type { ParsedItem } from "@/lib/paste-parser";

export type DeskMode = "wtt" | "wtb" | "wts";

export function deskLabel(item: ParsedItem): string {
  return formatShortLabel({ ...item, collectionId: "" });
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
}

export function indexDeskPosts(messages: TranscriptMessage[]): DeskPost[] {
  return messages.map((message) => ({
    message,
    haves: keyedItems(message.haves),
    wants: keyedItems(message.wants),
  }));
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
