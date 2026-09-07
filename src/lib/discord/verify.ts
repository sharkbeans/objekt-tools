import type { OwnedEntry } from "@/lib/cosmo-inventory";
import { indexOwned, type OwnedIndex, objektKey } from "@/lib/discord/match";
import type { ParsedItem } from "@/lib/paste-parser";

/**
 * Checks a pasted trader's claims against what they actually hold on-chain.
 *
 * This is the asymmetry objekt.my has over an indexer in a trading context:
 * Apollo and objekt.top will show you a collection, but neither tells you
 * "this person's claim is real, and here is what overlaps with yours". A
 * poster who linked their profile can be checked; a poster who typed a list
 * cannot. See docs/plans/035-discord-paste-match.md.
 */

export type VerificationState =
  | { status: "unlinked" }
  | { status: "pending" }
  | { status: "rate-limited" }
  | { status: "failed"; reason: string }
  | {
      status: "verified";
      /** Everything they can currently transfer. */
      inventory: OwnedEntry[];
      index: OwnedIndex;
      /** Claimed items confirmed present in that inventory. */
      confirmed: ParsedItem[];
      /** Claimed items they no longer hold — a stale list, not necessarily a lie. */
      stale: ParsedItem[];
    };

export interface ClaimCheck {
  confirmed: ParsedItem[];
  stale: ParsedItem[];
}

/** Split claimed haves into those the trader still holds and those they don't. */
export function checkClaims(
  claimed: ParsedItem[],
  index: OwnedIndex,
): ClaimCheck {
  const confirmed: ParsedItem[] = [];
  const stale: ParsedItem[] = [];
  for (const item of claimed) {
    const key = objektKey(item);
    // An unkeyable claim (freeform, ANY-filter) can't be checked either way —
    // treat it as confirmed rather than accusing them of a stale list.
    if (!key) {
      confirmed.push(item);
      continue;
    }
    if (index.byKey.has(key)) confirmed.push(item);
    else stale.push(item);
  }
  return { confirmed, stale };
}

export function buildVerification(
  claimed: ParsedItem[],
  inventory: OwnedEntry[],
): Extract<VerificationState, { status: "verified" }> {
  const index = indexOwned(inventory);
  const { confirmed, stale } = checkClaims(claimed, index);
  return { status: "verified", inventory, index, confirmed, stale };
}

/**
 * Which of the viewer's picked objekts this trader can actually supply.
 *
 * For a link-only poster this is the whole point: they typed no list, so their
 * verified inventory is the only thing that can be matched against — and it is
 * ground truth rather than a claim.
 */
export function suppliesPicked(
  index: OwnedIndex,
  picked: ReadonlySet<string>,
): string[] {
  const hits: string[] = [];
  for (const key of picked) if (index.byKey.has(key)) hits.push(key);
  return hits;
}

export class RateLimitedError extends Error {
  constructor() {
    super("Rate limited");
    this.name = "RateLimitedError";
  }
}

/**
 * Fetch one trader's transferable inventory by Cosmo nickname.
 *
 * `/api/objekts/by-nickname` allows 10 requests/min unauthenticated and 60
 * authenticated, so a large dump will run out of budget partway through. A 429
 * is surfaced as its own error type so callers can stop cleanly and tell the
 * user why, rather than marking honest traders as unverifiable.
 */
export async function fetchInventoryForVerification(
  nickname: string,
): Promise<OwnedEntry[]> {
  const res = await fetch(
    `/api/objekts/by-nickname/${encodeURIComponent(nickname)}`,
  );
  if (res.status === 429) throw new RateLimitedError();
  if (res.status === 404) throw new Error(`Cosmo user "${nickname}" not found`);
  if (!res.ok) throw new Error("Could not reach Cosmo");
  const data = await res.json();
  return data.results ?? [];
}

/**
 * Verify a queue of nicknames one at a time, stopping at the first rate limit.
 *
 * Sequential on purpose: firing them in parallel would burn the whole per-minute
 * budget in one burst and rate-limit the viewer's own inventory lookup too.
 */
export async function verifySequentially(
  nicknames: string[],
  onResult: (
    nickname: string,
    result:
      | { ok: true; inventory: OwnedEntry[] }
      | { ok: false; rateLimited: boolean; reason: string },
  ) => void,
): Promise<{ completed: number; rateLimited: boolean }> {
  let completed = 0;
  for (const nickname of nicknames) {
    try {
      const inventory = await fetchInventoryForVerification(nickname);
      onResult(nickname, { ok: true, inventory });
      completed++;
    } catch (err) {
      if (err instanceof RateLimitedError) {
        onResult(nickname, {
          ok: false,
          rateLimited: true,
          reason: "Rate limited",
        });
        return { completed, rateLimited: true };
      }
      onResult(nickname, {
        ok: false,
        rateLimited: false,
        reason: err instanceof Error ? err.message : "Failed",
      });
    }
  }
  return { completed, rateLimited: false };
}
