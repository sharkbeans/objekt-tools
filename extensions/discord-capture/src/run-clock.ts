/**
 * How long a run has left, and how current its results are.
 *
 * Split from the panel so the arithmetic can be tested without a browser.
 */

/**
 * A page's time before anything has been measured: Discord answering and
 * capture settling take a few seconds on top of the configured pause.
 */
const PAGE_GUESS_MS = 4_000;

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
  if (!progress || progress.running !== true) return null;
  const total = num(progress.total);
  const done = num(progress.done) ?? 0;
  const startedAt = num(progress.startedAt);
  if (!total || startedAt === null) return null;
  const startDone = num(progress.startDone) ?? 0;
  const pages = Math.max(1, num(progress.pages) ?? 1);
  const delayMs = Math.max(0, num(progress.delayMs) ?? 0);
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
      : pages * (delayMs + PAGE_GUESS_MS);
  return left * perQuery;
}

/** "under a minute left", "~4 min left", "~1 h 5 min left". */
export function formatRemaining(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "under a minute left";
  if (minutes < 60) return `~${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `~${hours} h${rest ? ` ${rest} min` : ""} left`;
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
