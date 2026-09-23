/**
 * How fast to search, learned from Discord pushing back.
 *
 * Discord lets a burst of searches through and then refuses them — "We dropped
 * the magnifying glass" — while its budget refills. Measured on a 20-code,
 * 10-page run at Instant: the first ten codes (about 70 requests) went through
 * almost clean, and most of the second ten failed. A fixed pace is either too
 * slow for the burst or too fast after it, so the run starts at the pace the
 * user chose and adapts, the way TCP backs off a congested link: double the
 * pause on every refusal, and give it back a second at a time while pages keep
 * loading.
 *
 * Every result page is its own search request, so the unit here is a request.
 */

/** A refusal never leaves the pace faster than this. */
export const MIN_PUSHBACK_MS = 5_000;
/** Nor slower than this: the panel's slowest setting. */
export const MAX_PACE_MS = 60_000;
/** Clean pages before easing off by `EASE_STEP_MS`. */
export const EASE_AFTER_PAGES = 8;
export const EASE_STEP_MS = 1_000;
/**
 * How fast a learned pace wears off between runs. Discord's budget refills
 * while nothing is searching, so a pace learned an hour ago says little.
 */
export const DECAY_MS_PER_MINUTE = 2_000;
/** The window recent requests are counted over. */
export const LEDGER_WINDOW_MS = 10 * 60_000;
/** Most request times kept; far more than a window can hold at any pace. */
const LEDGER_CAP = 600;

export interface Pace {
  /** Pause after each page, never below what the user chose. */
  delayMs: number;
  /** Clean pages since the pace last changed. */
  calm: number;
}

export function startPace(userDelayMs: number, learnedMs = 0): Pace {
  return {
    delayMs: Math.min(
      MAX_PACE_MS,
      Math.max(Math.max(0, userDelayMs), Math.max(0, learnedMs)),
    ),
    calm: 0,
  };
}

/** Discord refused a search: at least double the pause. */
export function pushedBack(pace: Pace): Pace {
  return {
    delayMs: Math.min(MAX_PACE_MS, Math.max(MIN_PUSHBACK_MS, pace.delayMs * 2)),
    calm: 0,
  };
}

/** A page loaded: after enough of them, ease back toward the user's pace. */
export function pageLoaded(pace: Pace, userDelayMs: number): Pace {
  const calm = pace.calm + 1;
  if (calm < EASE_AFTER_PAGES || pace.delayMs <= userDelayMs)
    return { delayMs: pace.delayMs, calm };
  return {
    delayMs: Math.max(Math.max(0, userDelayMs), pace.delayMs - EASE_STEP_MS),
    calm: 0,
  };
}

/** What a run should start at, from the pace an earlier run ended on. */
export function carriedPace(stored: unknown, now: number): number {
  if (!stored || typeof stored !== "object") return 0;
  const row = stored as Record<string, unknown>;
  const delayMs = Number(row.delayMs);
  const at = Number(row.at);
  if (!Number.isFinite(delayMs) || !Number.isFinite(at) || delayMs <= 0)
    return 0;
  const minutes = Math.max(0, now - at) / 60_000;
  return Math.max(0, Math.round(delayMs - minutes * DECAY_MS_PER_MINUTE));
}

/** Read the stored request times, newest last, dropping anything malformed. */
export function readLedger(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (at): at is number => typeof at === "number" && Number.isFinite(at),
  );
}

/** The request times worth keeping: inside the window, and not too many. */
export function trimLedger(ledger: readonly number[], now: number): number[] {
  return ledger.filter((at) => now - at < LEDGER_WINDOW_MS).slice(-LEDGER_CAP);
}

/** Requests sent inside the window. */
export function recentRequests(ledger: readonly number[], now: number): number {
  return ledger.filter((at) => now - at < LEDGER_WINDOW_MS).length;
}
