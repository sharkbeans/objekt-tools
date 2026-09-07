import { objektKey } from "@/lib/discord/match";
import type { TranscriptMessage } from "@/lib/discord/transcript";
import type { VerificationState } from "@/lib/discord/verify";
import { getSeasonPrefix, stripVariantSuffix } from "@/lib/season-prefix";

/**
 * "Who in this paste can supply objekt X?" across both kinds of poster.
 *
 * The pile (match.ts) is built from typed lists, which leaves a link-only
 * poster contributing nothing — even though verification proves they hold
 * thousands of tradable objekts. Rendering those inventories into the pile
 * would swamp it (one trader in the sample holds 4,348), so supply is indexed
 * and searched instead of browsed.
 *
 * See docs/plans/035-discord-paste-match.md.
 */

export type SupplySource = "listed" | "verified";

export interface Supplier {
  message: TranscriptMessage;
  /** "verified" is on-chain fact; "listed" is what they typed. */
  source: SupplySource;
  /** Copies held. Only meaningful for a verified supplier. */
  copies: number;
}

export interface SupplyEntry {
  key: string;
  member: string;
  season: string;
  collectionNo: string;
  suppliers: Supplier[];
}

/**
 * Search haystack for one objekt. Includes the community shorthand
 * ("cc301") alongside the full season name, because that is what traders
 * actually type — nobody searches "cream02 301".
 */
function label(entry: {
  member: string;
  season: string;
  collectionNo: string;
}): string {
  const prefix = getSeasonPrefix(entry.season);
  return [
    entry.member,
    entry.season,
    entry.collectionNo,
    prefix ? `${prefix}${entry.collectionNo}` : "",
  ]
    .join(" ")
    .toLowerCase();
}

/** Split a query into terms. Order-independent, so "cc301 nien" also works. */
function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Index everything the pasted traders can supply.
 *
 * A verified inventory supersedes the same trader's typed list for a given
 * objekt: if we know what they actually hold, their claim adds nothing.
 */
export function buildSupplyIndex(
  messages: TranscriptMessage[],
  verified: ReadonlyMap<string, VerificationState>,
): Map<string, SupplyEntry> {
  const index = new Map<string, SupplyEntry>();

  const ensure = (
    key: string,
    member: string,
    season: string,
    collectionNo: string,
  ): SupplyEntry => {
    const existing = index.get(key);
    if (existing) return existing;
    const created: SupplyEntry = {
      key,
      member,
      season,
      collectionNo: stripVariantSuffix(collectionNo),
      suppliers: [],
    };
    index.set(key, created);
    return created;
  };

  for (const message of messages) {
    const state = message.nickname ? verified.get(message.nickname) : undefined;
    const isVerified = state?.status === "verified";

    if (isVerified) {
      // Group the on-chain inventory by key so copies are counted.
      const counts = new Map<string, number>();
      for (const owned of state.inventory) {
        const key = objektKey(owned);
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        ensure(key, owned.member, owned.season, owned.collectionNo);
      }
      for (const [key, copies] of counts) {
        index.get(key)?.suppliers.push({ message, source: "verified", copies });
      }
      // Their typed list is redundant once the real inventory is known.
      continue;
    }

    for (const item of message.haves) {
      const key = objektKey(item);
      if (!key || !item.member) continue;
      const entry = ensure(key, item.member, item.season, item.collectionNo);
      if (!entry.suppliers.some((s) => s.message === message)) {
        entry.suppliers.push({
          message,
          source: "listed",
          copies: item.quantity ?? 1,
        });
      }
    }
  }

  return index;
}

/**
 * Free-text search over the supply index — the question a trader actually
 * arrives with ("who here has Nien cc301?").
 *
 * Matches on member, season and collection number in any order, so both
 * "nien cc301" and "cc301 nien" work.
 */
export function searchSupply(
  index: ReadonlyMap<string, SupplyEntry>,
  query: string,
  limit = 60,
): SupplyEntry[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const hits: SupplyEntry[] = [];
  for (const entry of index.values()) {
    const haystack = label(entry);
    if (terms.every((term) => haystack.includes(term))) {
      hits.push(entry);
      if (hits.length >= limit * 4) break;
    }
  }

  // Verified suppliers first, then scarcity — the order a trader would use.
  return hits
    .sort((a, b) => {
      const av = a.suppliers.some((s) => s.source === "verified") ? 0 : 1;
      const bv = b.suppliers.some((s) => s.source === "verified") ? 0 : 1;
      if (av !== bv) return av - bv;
      return a.suppliers.length - b.suppliers.length;
    })
    .slice(0, limit);
}

export interface DemandEntry {
  key: string;
  member: string;
  season: string;
  collectionNo: string;
  /** Posters asking for this objekt. */
  wanters: TranscriptMessage[];
}

/**
 * The mirror of the supply index: who in this paste is *asking* for objekt X.
 *
 * A trader arrives holding a spare and wanting to know who will take it, which
 * is a demand question. Indexing only supply answers the opposite question and
 * — worse — answers it in a shape that reads like a match ("lynnie has one")
 * when the viewer was looking for a taker.
 *
 * Unlike supply, demand is never chain-verifiable: a want is an intention, not
 * a holding. There is deliberately no "verified" source here.
 */
export function buildDemandIndex(
  messages: TranscriptMessage[],
): Map<string, DemandEntry> {
  const index = new Map<string, DemandEntry>();

  for (const message of messages) {
    for (const item of message.wants) {
      // ANY-filter wants ("Any Xinyu CC fco") name no single objekt, so they
      // cannot be keyed. Skipping them undercounts rather than inventing a hit.
      if (item.isAny) continue;
      const key = objektKey(item);
      if (!key || !item.member) continue;
      let entry = index.get(key);
      if (!entry) {
        entry = {
          key,
          member: item.member,
          season: item.season,
          collectionNo: stripVariantSuffix(item.collectionNo),
          wanters: [],
        };
        index.set(key, entry);
      }
      if (!entry.wanters.includes(message)) entry.wanters.push(message);
    }
  }

  return index;
}

/** Free-text search over demand. Same term handling as `searchSupply`. */
export function searchDemand(
  index: ReadonlyMap<string, DemandEntry>,
  query: string,
  limit = 60,
): DemandEntry[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const hits: DemandEntry[] = [];
  for (const entry of index.values()) {
    const haystack = label(entry);
    if (terms.every((term) => haystack.includes(term))) {
      hits.push(entry);
      if (hits.length >= limit * 4) break;
    }
  }

  // Most-wanted first: the objekt several people are asking for is the one
  // worth acting on.
  return hits
    .sort((a, b) => b.wanters.length - a.wanters.length)
    .slice(0, limit);
}

/** Suppliers for the viewer's picked objekts, across listed and verified. */
export function suppliersForPicks(
  index: ReadonlyMap<string, SupplyEntry>,
  picked: ReadonlySet<string>,
): SupplyEntry[] {
  const out: SupplyEntry[] = [];
  for (const key of picked) {
    const entry = index.get(key);
    if (entry && entry.suppliers.length > 0) out.push(entry);
  }
  return out.sort((a, b) => a.suppliers.length - b.suppliers.length);
}
