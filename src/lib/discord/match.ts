import type { OwnedEntry } from "@/lib/cosmo-inventory";
import type { TranscriptMessage } from "@/lib/discord/transcript";
import type { ParsedItem } from "@/lib/paste-parser";
import { stripVariantSuffix } from "@/lib/season-prefix";

/**
 * Cross-references pasted Discord trade lists against the viewer's own on-chain
 * inventory. See docs/plans/035-discord-paste-match.md.
 *
 * Deliberately key-based rather than resolved through /api/objekts/search:
 * both sides already carry member + season + collectionNo, so a dump of a few
 * hundred items costs zero network round-trips.
 *
 * The inversion this enables is the point of the feature. The existing
 * two-sided matcher (trade-post-matches.ts) needs both traders registered and
 * refuses to run unless a post has haves *and* wants. Here the viewer's haves
 * come free from the chain and the counterparty's wants come from the paste,
 * so a useful answer exists after one paste and one nickname — the other
 * trader never needs an account.
 */

export type ObjektKeyParts = {
  member?: string | null;
  season?: string | null;
  collectionNo?: string | null;
};

/** Normalised identity for an objekt collection. A/Z twins collapse together. */
export function objektKey(item: ObjektKeyParts): string | null {
  if (!item.member || !item.season || !item.collectionNo) return null;
  return [
    item.member.toLowerCase(),
    item.season.toLowerCase(),
    stripVariantSuffix(item.collectionNo).toLowerCase(),
  ].join("|");
}

export interface OwnedIndex {
  /** key → every copy the viewer holds, so spares are visible. */
  byKey: Map<string, OwnedEntry[]>;
  total: number;
}

export function indexOwned(entries: OwnedEntry[]): OwnedIndex {
  const byKey = new Map<string, OwnedEntry[]>();
  for (const entry of entries) {
    const key = objektKey(entry);
    if (!key) continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(entry);
    else byKey.set(key, [entry]);
  }
  return { byKey, total: entries.length };
}

export interface WantHit {
  /** The counterparty's want line that the viewer can satisfy. */
  want: ParsedItem;
  /** Copies the viewer holds. Length > 1 means they can trade a spare. */
  owned: OwnedEntry[];
}

export interface MatchedPoster {
  message: TranscriptMessage;
  /** Their wants that the viewer actually owns — the reason to make contact. */
  theyWantYouHave: WantHit[];
  /** Their haves, offered as a pile for the viewer to pick from. */
  theyHave: ParsedItem[];
  /** True once the viewer has picked something from this poster's haves. */
  isMutual: boolean;
}

/**
 * `picked` is the set of objekt keys the viewer has selected from the pile.
 * Wants are expressed by picking, not by pre-registering a want list — which
 * is what lets the tool be useful before the viewer has told it anything.
 */
export function matchTranscript(
  messages: TranscriptMessage[],
  owned: OwnedIndex,
  picked: ReadonlySet<string> = new Set(),
): MatchedPoster[] {
  const results: MatchedPoster[] = [];

  for (const message of messages) {
    const theyWantYouHave: WantHit[] = [];
    for (const want of message.wants) {
      // ANY-filter wants ("Any Xinyu CC fco") have no single collection to key
      // on. Skipping them undercounts rather than inventing a false match.
      if (want.isAny) continue;
      const key = objektKey(want);
      if (!key) continue;
      const held = owned.byKey.get(key);
      if (held && held.length > 0) theyWantYouHave.push({ want, owned: held });
    }

    const isMutual =
      theyWantYouHave.length > 0 &&
      message.haves.some((have) => {
        const key = objektKey(have);
        return key !== null && picked.has(key);
      });

    results.push({
      message,
      theyWantYouHave,
      theyHave: message.haves,
      isMutual,
    });
  }

  // Mutual matches first, then by how much the viewer can satisfy — the
  // ordering a trader would apply by hand when scanning a channel.
  return results.sort((a, b) => {
    if (a.isMutual !== b.isMutual) return a.isMutual ? -1 : 1;
    return b.theyWantYouHave.length - a.theyWantYouHave.length;
  });
}

export interface PileEntry {
  key: string;
  item: ParsedItem;
  /** Every poster offering this objekt, so the viewer can choose who to ask. */
  offeredBy: TranscriptMessage[];
}

/**
 * The union of everything the pasted traders collectively have, deduped into a
 * browsable pile. This is the "you don't need a want list" half: the viewer
 * picks from what is actually on offer instead of declaring wants up front.
 */
export function buildPile(messages: TranscriptMessage[]): PileEntry[] {
  const byKey = new Map<string, PileEntry>();

  for (const message of messages) {
    for (const item of message.haves) {
      const key = objektKey(item);
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.offeredBy.includes(message)) {
          existing.offeredBy.push(message);
        }
        continue;
      }
      byKey.set(key, { key, item, offeredBy: [message] });
    }
  }

  // Scarcest first: an objekt only one person is offering is the one worth
  // acting on before it goes.
  return [...byKey.values()].sort(
    (a, b) => a.offeredBy.length - b.offeredBy.length,
  );
}

export interface TranscriptSummary {
  posters: number;
  verified: number;
  claimed: number;
  contactless: number;
  haveItems: number;
  wantItems: number;
}

export function summarize(messages: TranscriptMessage[]): TranscriptSummary {
  return {
    posters: messages.length,
    verified: messages.filter((m) => m.tier === "verified").length,
    claimed: messages.filter((m) => m.tier === "claimed").length,
    contactless: messages.filter((m) => m.tier === "contactless").length,
    haveItems: messages.reduce((n, m) => n + m.haves.length, 0),
    wantItems: messages.reduce((n, m) => n + m.wants.length, 0),
  };
}
