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

import { EASE_AFTER_PAGES, EASE_STEP_MS } from "./adaptive-pace";
import { PAGE_GUESS_MS } from "./run-clock";

/** Queries one run will fire. Beyond this it is not searching, it is scraping. */
export const QUERY_CAP = 40;

/** How long a searched code stays "done" by default. */
export const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * How long a searched code is remembered at all. Longer than the cooldown:
 * past it the code is searched again, but having been searched before is what
 * lets that search stop paging once it reaches posts it already captured.
 */
export const SEARCHED_MEMORY_MS = 30 * 24 * 60 * 60 * 1000;

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

/** The pause between result pages the extension defaults to and recommends. */
export const RECOMMENDED_DELAY_MS = 5_000;

/**
 * Result pages one run should walk at the recommended pace. Plan 036 sized a
 * 30-objekt refresh at 1–2 pages each: about sixty requests.
 */
export const RECOMMENDED_PAGE_BUDGET = 60;

/**
 * How many result pages a run at this pace can walk before it is past the
 * recommendation.
 *
 * Neither setting is risky alone — one objekt over ten pages is ten requests.
 * What Discord limits is requests arriving close together, so the budget is
 * the recommended one scaled by how long each page takes: a faster pace packs
 * the same pages into less time and gets fewer of them.
 */
export function pageBudget(delayMs: number): number {
  const perPage = Math.max(0, delayMs) + PAGE_GUESS_MS;
  return Math.floor(
    (RECOMMENDED_PAGE_BUDGET * perPage) /
      (RECOMMENDED_DELAY_MS + PAGE_GUESS_MS),
  );
}

/** The slowest pace the panel offers, in seconds per page. */
export const MAX_DELAY_S = 60;

/**
 * Pages and pace to suggest for a search of this many codes.
 *
 * Few codes go deep, many go shallow, and the pace is the fastest whole second
 * that keeps codes × pages inside `pageBudget` — never faster than the
 * recommended 5s. Pages are cheap once a code has been searched before, since
 * paging stops as soon as it reaches posts already captured.
 */
export function recommendedTuning(codes: number): {
  pages: number;
  delaySeconds: number;
} {
  const count = Math.max(0, codes);
  const pages = count <= 5 ? 10 : count <= 10 ? 6 : count <= 20 ? 4 : 3;
  const first = RECOMMENDED_DELAY_MS / 1000;
  for (let seconds = first; seconds <= MAX_DELAY_S; seconds++)
    if (pageBudget(seconds * 1000) >= count * pages)
      return { pages, delaySeconds: seconds };
  return { pages, delaySeconds: MAX_DELAY_S };
}

/** The most result pages a run will walk, against what its pace allows. */
export function searchLoad(
  queryCount: number,
  pages: number,
  delayMs: number,
  /** What past runs measured; the fixed guess until there are any. */
  stats: { pageMs: number; pageShare: number } | null = null,
  /**
   * A slower pace the run starts at, carried from one Discord pushed back on.
   * It eases toward `delayMs` as pages load, so it is not paid on every page.
   */
  startMs = delayMs,
): { pages: number; budget: number; over: boolean; estimatedMs: number } {
  const walked = Math.max(0, queryCount) * Math.max(1, pages);
  const budget = pageBudget(delayMs);
  return {
    pages: walked,
    budget,
    over: walked > budget,
    // Same figures remainingMs falls back on before a run has measured itself:
    // the pages a run really walks, at the time each really takes.
    estimatedMs: easedPausesMs(
      Math.round(walked * (stats?.pageShare ?? 1)),
      startMs,
      delayMs,
      stats?.pageMs ?? PAGE_GUESS_MS,
    ),
  };
}

/**
 * Time for `pages` pages when the pause starts at `startMs` and eases back to
 * `floorMs` the way adaptive-pace.ts does while pages keep loading.
 */
function easedPausesMs(
  pages: number,
  startMs: number,
  floorMs: number,
  pageMs: number,
): number {
  const floor = Math.max(0, floorMs);
  let pause = Math.max(floor, startMs);
  let total = 0;
  for (let page = 1; page <= pages; page++) {
    total += pause + pageMs;
    if (page % EASE_AFTER_PAGES === 0)
      pause = Math.max(floor, pause - EASE_STEP_MS);
  }
  return total;
}

/**
 * Hue for how much of the budget a run uses: green when light, through yellow
 * to orange at the budget, and red only once past it — the same point the
 * warning appears.
 */
export function loadHue(load: { pages: number; budget: number }): number {
  if (load.pages > load.budget) return 0;
  const used = load.budget > 0 ? load.pages / load.budget : 1;
  return Math.round(120 - 90 * used);
}

/**
 * What a search looked for, as one comparable string: the codes, in any order,
 * and how deep it paged. Pace and skip-recent are left out — they change how a
 * run goes, not what it finds — so changing them does not make results stale.
 */
export function searchFilters(codes: Iterable<string>, pages: number): string {
  return `${[...new Set(codes)].sort().join(",")}|${pages}`;
}

/** One line saying what was left out, or nothing when nothing was. */
export function describePlan(plan: Plan): string {
  const parts: string[] = [];
  if (plan.skipped.length)
    parts.push(
      `${plan.skipped.length} searched recently and skipped (uncheck to search them anyway)`,
    );
  if (plan.overflow.length)
    parts.push(
      `${plan.overflow.length} over the ${QUERY_CAP}-code limit for one run. Run again to continue`,
    );
  return parts.join(" · ");
}
