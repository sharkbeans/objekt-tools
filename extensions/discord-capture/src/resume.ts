/**
 * Picking a search run back up after Discord dies under it.
 *
 * A run lives in the content script, so reloading Discord, navigating away, or
 * the tab crashing outright takes the queue with it. Up to now that was only
 * *reported* — the panel noticed the progress stamp had stopped moving and said
 * the run died — and a fifty-code list that fell over on code nine had to be
 * started again by hand, re-searching the eight that already worked.
 *
 * So the queue is written down as it goes. What is kept is the plan, never the
 * results: the codes the user typed, how far through them the run got, and the
 * two settings that shape it. Captured posts are already in the index and are
 * not duplicated by a resume, because they dedupe on Discord's own message id.
 *
 * There are two ways back in. A reload picks up a run that Discord took down
 * on its own, and the decision to do that is deliberately narrow, because the
 * failure this recovers from can be *caused* by the thing it wants to retry.
 * Continue in the panel picks up any unfinished run, because the user asked.
 */

/** A run that was interrupted, as it is written to storage. */
export interface PendingRun {
  /** The run id, so resumed posts are still filed under the original search. */
  run: string;
  /** Every query in the original plan, in order. */
  queries: string[];
  /** How many of them were finished before the interruption. */
  done: number;
  pages: number;
  delayMs: number;
  /** The age cutoff the run was started with; zero for none. */
  maxAgeMs: number;
  /** Time spent searching so far, across earlier calls; not the gaps. */
  elapsedMs: number;
  planNote: string;
  /** The tab it was running in, so another Discord tab does not adopt it. */
  tab: number | null;
  /** Consecutive resumes that have started at this same query. */
  tries: number;
  /** When it was last written, for deciding it is too old to pick up. */
  at: number;
  /**
   * Whether reloading Discord should carry on with it unasked.
   *
   * True while a run is going, so a tab that dies mid-run comes back to it. A
   * run that stopped for a reason of its own — Stop, a rate limit, a search
   * box that would not take the text — is false: it can be continued, but
   * only when someone presses Continue. Restarting a rate-limited run on the
   * next page load is the opposite of backing off.
   */
  auto: boolean;
}

/**
 * How many times one query may take the tab down before it is stepped over.
 *
 * The point of a resume is a run that finishes. A query that reliably kills
 * Discord would otherwise reload, retry, and kill it again for ever, which is
 * worse than the crash — so the third encounter skips it and moves on, and the
 * run reports which code it was.
 */
export const MAX_TRIES = 2;

/**
 * How long an interrupted run stays resumable on its own.
 *
 * Long enough to cover a crash, a browser restart and a user going to make
 * coffee; short enough that opening Discord tomorrow does not start typing into
 * the search box on its own.
 */
export const RESUME_WINDOW_MS = 30 * 60_000;

/**
 * How long Continue stays on offer.
 *
 * Pressing it is a decision, so it can reach further back than a reload can —
 * but not so far that it is continuing a search whose results went stale days
 * ago, when a new one would do better.
 */
export const CONTINUE_WINDOW_MS = 24 * 60 * 60_000;

/**
 * How long a run may go without reporting before it is presumed dead.
 *
 * A page settles in fifteen seconds at the outside and reports on every page,
 * so a minute of silence is not a slow run — it is a tab that navigated away
 * mid-run and took the content script with it.
 */
export const STALE_MS = 60_000;

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** Read a stored pending run, rejecting anything that is not one. */
export function readPendingRun(value: unknown): PendingRun | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.run !== "string" || !row.run) return null;
  if (!isStringArray(row.queries) || !row.queries.length) return null;
  const done = Number(row.done);
  const tries = Number(row.tries);
  const at = Number(row.at);
  if (!Number.isFinite(done) || done < 0 || done > row.queries.length)
    return null;
  if (!Number.isFinite(at)) return null;
  return {
    run: row.run,
    queries: row.queries,
    done,
    pages: Number.isFinite(Number(row.pages)) ? Number(row.pages) : 1,
    delayMs: Number.isFinite(Number(row.delayMs)) ? Number(row.delayMs) : 0,
    maxAgeMs:
      Number.isFinite(Number(row.maxAgeMs)) && Number(row.maxAgeMs) > 0
        ? Number(row.maxAgeMs)
        : 0,
    elapsedMs:
      Number.isFinite(Number(row.elapsedMs)) && Number(row.elapsedMs) > 0
        ? Number(row.elapsedMs)
        : 0,
    planNote: typeof row.planNote === "string" ? row.planNote : "",
    tab: Number.isFinite(Number(row.tab)) ? Number(row.tab) : null,
    tries: Number.isFinite(tries) && tries > 0 ? tries : 0,
    at,
    // Written before this field existed only by a run that was going, which
    // is what `true` means.
    auto: row.auto !== false,
  };
}

/** What to do about a pending run. */
export type ResumePlan =
  | {
      action: "drop";
      reason: string;
      /**
       * Whether the record is finished with. Some refusals only mean "not on
       * its own, not from here" — Continue can still take those — and deleting
       * them is how a run another tab owns, or one that stopped on purpose,
       * lost its place.
       */
      forget: boolean;
    }
  | {
      action: "run";
      /** The queries still to search, the first of which is retried. */
      queries: string[];
      /** How many of the original plan are behind them, for progress. */
      done: number;
      /** A query stepped over because it kept taking the tab down. */
      skipped: string | null;
      state: PendingRun;
    };

/**
 * Decide whether an unfinished run should carry on, and from where.
 *
 * `tab` is this tab's own id. On a reload, a pending run belongs to the tab it
 * started in: without that check, a second Discord tab opening would adopt a
 * run it knows nothing about and both would type into their own search boxes
 * at once. A run whose tab id was never recorded is adoptable.
 *
 * `continued` is the user pressing Continue, which may take the run from any
 * tab and whatever stopped it — the caller has already checked that nothing
 * is still running it.
 */
export function planResume(
  state: PendingRun | null,
  tab: number | null,
  now: number,
  continued = false,
): ResumePlan {
  if (!state)
    return { action: "drop", reason: "nothing pending", forget: false };
  if (now - state.at > CONTINUE_WINDOW_MS)
    return {
      action: "drop",
      reason: "the interrupted run is too old",
      forget: true,
    };
  if (!continued) {
    if (!state.auto)
      return { action: "drop", reason: "it was stopped", forget: false };
    if (now - state.at > RESUME_WINDOW_MS)
      return {
        action: "drop",
        reason: "the interrupted run is too old to resume unasked",
        forget: false,
      };
    if (state.tab !== null && tab !== null && state.tab !== tab)
      return { action: "drop", reason: "another tab owns it", forget: false };
  }
  let done = state.done;
  let skipped: string | null = null;
  // The query that was in flight is the one that went down with the tab. Retry
  // it, but not for ever: past the limit it is the likeliest cause and the run
  // is worth more than that one code.
  if (state.tries >= MAX_TRIES) {
    skipped = state.queries[done] ?? null;
    done += 1;
  }
  const queries = state.queries.slice(done);
  if (!queries.length)
    return { action: "drop", reason: "nothing left to search", forget: true };
  return { action: "run", queries, done, skipped, state };
}

/**
 * What Continue would pick up, for the panel to offer — or null.
 *
 * Only offered while every code it would search is still on the want list: a
 * list edited since the run stopped is a different search, and continuing the
 * old one would type codes the user has deleted.
 */
export function continuable(
  state: PendingRun | null,
  wanted: ReadonlySet<string>,
  now: number,
): { left: number; next: string } | null {
  const plan = planResume(state, null, now, true);
  if (plan.action !== "run") return null;
  if (!plan.queries.every((query) => wanted.has(query))) return null;
  return { left: plan.queries.length, next: plan.queries[0] };
}

/** The record to write before a resumed run starts, with its try counted. */
export function nextPending(
  state: PendingRun,
  done: number,
  tab: number | null,
  now: number,
): PendingRun {
  return {
    ...state,
    done,
    tab,
    // A resume that stepped over a query starts a fresh count for the next one.
    tries: done === state.done ? state.tries + 1 : 1,
    at: now,
    // Going again, so a crash from here is one a reload should pick up.
    auto: true,
  };
}
