import type { TranscriptMessage } from "@/lib/discord/transcript";
import { type ParsedItem, parsePastedTrade } from "@/lib/paste-parser";
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
  byKey: Map<string, ObjektKeyParts[]>;
  total: number;
}

/**
 * Index what the viewer can offer.
 *
 * Takes bare key parts rather than chain rows so the same index serves both
 * sources: an inventory loaded from a Cosmo nickname, and a handful of spares
 * the viewer simply typed in. A trader who will not link Cosmo still has to be
 * able to say "I have JiYeon CC102" — that is the whole of their side of the
 * trade, and requiring a chain lookup to express it locks them out of the one
 * panel that answers their question.
 */
export function indexOwned(entries: ObjektKeyParts[]): OwnedIndex {
  const byKey = new Map<string, ObjektKeyParts[]>();
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
  /** Objekt key. Unique within a poster, so it doubles as a render key. */
  key: string;
  /** The counterparty's want line that the viewer can satisfy. */
  want: ParsedItem;
  /** Copies the viewer holds. Length > 1 means they can trade a spare. */
  owned: ObjektKeyParts[];
}

/**
 * Parse the spares a viewer typed by hand into matchable items.
 *
 * `parsePastedTrade` is section-driven, so a bare list of objekts is given the
 * HAVE header it would otherwise be missing. Everything typed here is by
 * definition a have.
 */
export function parseOffering(text: string): ParsedItem[] {
  if (!text.trim()) return [];
  return parsePastedTrade(`HAVE\n${text}`).haves;
}

export interface MatchedPoster {
  message: TranscriptMessage;
  /** Their wants that the viewer actually owns — the reason to make contact. */
  theyWantYouHave: WantHit[];
  /** Their haves, offered as a pile for the viewer to pick from. */
  theyHave: ParsedItem[];
  /** Their haves that appear on the viewer's want list — the return leg. */
  theyHaveYouWant: ParsedItem[];
  /** True when both sides of the proposed swap overlap. */
  isMutual: boolean;
}

/**
 * `wantedKeys` is the viewer's want list. It can contain haves chosen from the
 * imported pile as well as wants they typed before importing the paste.
 */
export function matchTranscript(
  messages: TranscriptMessage[],
  owned: OwnedIndex,
  wantedKeys: ReadonlySet<string> = new Set(),
): MatchedPoster[] {
  const results: MatchedPoster[] = [];

  for (const message of messages) {
    const theyWantYouHave: WantHit[] = [];
    // Deduped by objekt: traders repeat a want across lines ("Xinyu CC202" in
    // one block and again in another), and listing it twice both misleads the
    // viewer about demand and produces colliding render keys.
    const seenWant = new Set<string>();
    for (const want of message.wants) {
      // ANY-filter wants ("Any Xinyu CC fco") have no single collection to key
      // on. Skipping them undercounts rather than inventing a false match.
      if (want.isAny) continue;
      const key = objektKey(want);
      if (!key || seenWant.has(key)) continue;
      const held = owned.byKey.get(key);
      if (!held || held.length === 0) continue;
      seenWant.add(key);
      theyWantYouHave.push({ key, want, owned: held });
    }

    const seenHave = new Set<string>();
    const theyHaveYouWant = message.haves.filter((have) => {
      const key = objektKey(have);
      if (!key || seenHave.has(key) || !wantedKeys.has(key)) return false;
      seenHave.add(key);
      return true;
    });

    results.push({
      message,
      theyWantYouHave,
      theyHave: message.haves,
      theyHaveYouWant,
      isMutual: theyWantYouHave.length > 0 && theyHaveYouWant.length > 0,
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
