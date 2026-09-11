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
 * The decision to resume is deliberately narrow, because the failure this
 * recovers from can be *caused* by the thing it wants to retry.
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
  planNote: string;
  /** The tab it was running in, so another Discord tab does not adopt it. */
  tab: number | null;
  /** Consecutive resumes that have started at this same query. */
  tries: number;
  /** When it was last written, for deciding it is too old to pick up. */
  at: number;
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
 * How long an interrupted run stays resumable.
 *
 * Long enough to cover a crash, a browser restart and a user going to make
 * coffee; short enough that opening Discord tomorrow does not start typing into
 * the search box on its own.
 */
export const RESUME_WINDOW_MS = 30 * 60_000;

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
    planNote: typeof row.planNote === "string" ? row.planNote : "",
    tab: Number.isFinite(Number(row.tab)) ? Number(row.tab) : null,
    tries: Number.isFinite(tries) && tries > 0 ? tries : 0,
    at,
  };
}

/** What to do about a pending run found at startup. */
export type ResumePlan =
  | { action: "drop"; reason: string }
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
 * Decide whether an interrupted run should carry on, and from where.
 *
 * `tab` is this tab's own id. A pending run belongs to the tab it started in:
 * without that check, a second Discord tab opening would adopt a run it knows
 * nothing about and both would type into their own search boxes at once. A run
 * whose tab id was never recorded is adoptable, because a crashed tab comes
 * back with a new id and would otherwise strand its own run.
 */
export function planResume(
  state: PendingRun | null,
  tab: number | null,
  now: number,
): ResumePlan {
  if (!state) return { action: "drop", reason: "nothing pending" };
  if (now - state.at > RESUME_WINDOW_MS)
    return { action: "drop", reason: "the interrupted run is too old" };
  if (state.tab !== null && tab !== null && state.tab !== tab)
    return { action: "drop", reason: "another tab owns it" };
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
    return { action: "drop", reason: "nothing left to search" };
  return { action: "run", queries, done, skipped, state };
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
  };
}
