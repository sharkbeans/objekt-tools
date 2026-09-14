/**
 * What a run will actually search, out of what was asked for.
 *
 * Two things stand between a want list and a list of queries. A want list is
 * pasted, so it can be enormous — three hundred codes is one paste away, and
 * three hundred searches in a row is a rate limit with extra steps. And a want
 * list barely changes between runs, so searching every code again from scratch
 * spends most of a run re-finding posts that are already in the index.
 *
 * Both are decided here, away from the DOM, so the rules can be read and tested
 * without a browser.
 */

/** Queries one run will fire. Beyond this it is not searching, it is scraping. */
export const QUERY_CAP = 40;

/** How long a searched code stays "done" by default. */
export const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export interface Plan {
  /** Queries to fire, in order. */
  queries: string[];
  /** Searched recently enough to skip this time. */
  skipped: string[];
  /** Dropped because the run would otherwise be too long. */
  overflow: string[];
}

/** Read the "when did we last search this" map, tolerating anything in storage. */
export function readSearchedAt(value: unknown): Map<string, number> {
  const searched = new Map<string, number>();
  if (!value || typeof value !== "object") return searched;
  for (const [query, at] of Object.entries(value as Record<string, unknown>))
    if (typeof at === "number" && Number.isFinite(at) && at > 0)
      searched.set(query, at);
  return searched;
}

/**
 * Forget entries older than the cooldown, so the map cannot grow forever.
 *
 * It is keyed by collection code, so it is bounded by the catalogue rather than
 * by usage — but a stale entry is still a row read on every run, and an old one
 * carries no information: past the cooldown it means the same as absent.
 */
export function pruneSearchedAt(
  searched: Map<string, number>,
  cooldownMs: number,
  now: number,
): Record<string, number> {
  const kept: Record<string, number> = {};
  for (const [query, at] of searched)
    if (now - at < cooldownMs) kept[query] = at;
  return kept;
}

/**
 * Decide the run.
 *
 * Skipping comes before the cap, so a repeat run spends its budget on codes
 * that have not been looked at rather than re-running the first forty.
 */
export function planQueries(
  queries: readonly string[],
  options: {
    searched?: Map<string, number>;
    cooldownMs?: number;
    now?: number;
    cap?: number;
  } = {},
): Plan {
  const cooldownMs = Math.max(0, options.cooldownMs ?? 0);
  const now = options.now ?? Date.now();
  const searched = options.searched ?? new Map<string, number>();
  const cap = Math.max(1, options.cap ?? QUERY_CAP);
  const skipped: string[] = [];
  const due: string[] = [];
  for (const query of queries) {
    const at = searched.get(query);
    if (cooldownMs > 0 && at !== undefined && now - at < cooldownMs)
      skipped.push(query);
    else due.push(query);
  }
  return { queries: due.slice(0, cap), skipped, overflow: due.slice(cap) };
}

/** One line saying what was left out, or nothing when nothing was. */
export function describePlan(plan: Plan): string {
  const parts: string[] = [];
  if (plan.skipped.length)
    parts.push(
      `${plan.skipped.length} searched recently — skipped (uncheck to search them anyway)`,
    );
  if (plan.overflow.length)
    parts.push(
      `${plan.overflow.length} over the ${QUERY_CAP}-code limit for one run — run again to continue`,
    );
  return parts.join(" · ");
}
