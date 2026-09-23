/**
 * The cool-down after Discord looked rate-limited.
 *
 * A run that stalls out (see `stallLimit` in search.ts) is the one sign of a
 * rate limit this extension can see: it never touches Discord's API, so it
 * never gets a 429. Warning and leaving Search enabled let the next click type
 * straight back into a client that was refusing to answer, which is what gets
 * an account noticed. So, like Discrub, a stall blocks every new search — a
 * fresh run, Continue, and the resume after a reload — for ten minutes.
 */

export const RATE_LIMIT_LOCKOUT_MS = 10 * 60_000;

/** The stored `rateLimitedAt`, or null when it is missing or malformed. */
export function readRateLimitedAt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/**
 * Milliseconds left on the cool-down, or 0 once it is over. A time in the
 * future (a clock that moved backwards) counts from now rather than blocking
 * for longer than the cool-down.
 */
export function lockoutRemaining(at: number | null, now: number): number {
  if (at === null) return 0;
  const elapsed = Math.max(0, now - at);
  return Math.max(0, RATE_LIMIT_LOCKOUT_MS - elapsed);
}

/** "7:42" — minutes and seconds, rounded up so it never reads 0:00 early. */
export function formatLockout(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function lockoutMessage(ms: number): string {
  return `Discord looked rate-limited, so searching is paused to protect your account. Try again in ${formatLockout(ms)}.`;
}
