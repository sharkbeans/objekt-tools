/**
 * How long a run has left, and how current its results are.
 *
 * Split from the panel so the arithmetic can be tested without a browser.
 */

/**
 * A page's time before anything has been measured: Discord answering and
 * capture settling take a few seconds on top of the configured pause.
 */
export const PAGE_GUESS_MS = 4_000;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Milliseconds until the run in `progress` finishes, or null when there is no
 * run to estimate.
 *
 * Measured from this call of the run once any of it is behind it, since
 * queries that run out of results early are much quicker than the settings
 * suggest; guessed from the pace and page count until then. `done` counts
 * queries submitted, so while running the last one counted is still in hand,
 * and `page` says how far into it the run is.
 */
export function remainingMs(
  progress: Record<string, unknown> | null,
  now: number,
): number | null {
  if (progress?.running !== true) return null;
  const total = num(progress.total);
  const done = num(progress.done) ?? 0;
  const startedAt = num(progress.startedAt);
  if (!total || startedAt === null) return null;
  const startDone = num(progress.startDone) ?? 0;
  const pages = Math.max(1, num(progress.pages) ?? 1);
  const delayMs = Math.max(0, num(progress.delayMs) ?? 0);
  const pageMs = num(progress.pageMs) ?? PAGE_GUESS_MS;
  const share = num(progress.pageShare) ?? 1;
  const page = num(progress.page);
  // Queries fully behind the run, plus the share of the one in hand. Until this
  // call has submitted one, nothing is in hand and `done` is all behind it.
  const inHand = page !== null ? Math.min(1, Math.max(0, page - 1) / pages) : 0;
  const behind = done > startDone ? done - 1 + inHand : done;
  const left = Math.max(0, total - behind);
  const measured = behind - startDone;
  const perQuery =
    measured > 0
      ? Math.max(0, now - startedAt) / measured
      : Math.max(1, pages * share) * (delayMs + pageMs);
  return left * perQuery;
}

/**
 * How long the search has been going, or took: this call of the run plus any
 * earlier calls it continued (`priorMs`), and not the gap between them.
 */
export function elapsedMs(
  progress: Record<string, unknown> | null,
  now: number,
): number | null {
  const startedAt = num(progress?.startedAt);
  if (startedAt === null) return null;
  const end = num(progress?.finishedAt) ?? now;
  return (
    Math.max(0, num(progress?.priorMs) ?? 0) + Math.max(0, end - startedAt)
  );
}

/** A stopwatch reading: "0:42", "4:12", "1:02:05". */
export function formatElapsed(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** What past runs measured, for estimating the next one. */
export interface RunStats {
  /** Time per page on top of the configured pause: Discord plus capture. */
  pageMs: number;
  /** Pages walked out of pages asked for; codes often stop early. */
  pageShare: number;
}

/** Read stored stats, or null when there are none worth using. */
export function readRunStats(value: unknown): RunStats | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const pageMs = num(row.pageMs);
  const pageShare = num(row.pageShare);
  if (pageMs === null || pageShare === null) return null;
  if (pageMs <= 0 || pageShare <= 0 || pageShare > 1) return null;
  return { pageMs, pageShare };
}

/**
 * Fold one finished run into the stats. Weighted half and half with what came
 * before, so one odd run moves the estimate without taking it over. Runs too
 * short to say anything (under three pages) are left out.
 */
export function updateRunStats(
  previous: RunStats | null,
  run: {
    elapsedMs: number;
    pagesWalked: number;
    pagesAsked: number;
    delayMs: number;
  },
): RunStats | null {
  if (run.pagesWalked < 3 || run.pagesAsked <= 0) return previous;
  const perPage = run.elapsedMs / run.pagesWalked - Math.max(0, run.delayMs);
  const measured: RunStats = {
    // Never below a second: a page cannot settle faster than Discord answers.
    pageMs: Math.max(1_000, perPage),
    pageShare: Math.min(1, Math.max(0.05, run.pagesWalked / run.pagesAsked)),
  };
  if (!previous) return measured;
  return {
    pageMs: (previous.pageMs + measured.pageMs) / 2,
    pageShare: (previous.pageShare + measured.pageShare) / 2,
  };
}

/** "under a minute", "~4 min", "~1 h", "~1 h 5 min" — a span, not a target. */
export function describeDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `~${hours} h${rest ? ` ${rest} min` : ""}`;
}

/** "under a minute left", "~4 min left", "~1 h 5 min left". */
export function formatRemaining(ms: number): string {
  return `${describeDuration(ms)} left`;
}

/**
 * The newest post's time, in the viewer's own timezone and named, so a result
 * read across timezones is not an hour out without saying so.
 */
export function formatAsOf(time: number, locale?: string): string {
  return `as of ${new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(time))}`;
}
