import { redis } from "@/lib/redis";

/**
 * Increments a Redis counter for the given key and returns whether the caller
 * has exceeded the allowed limit.
 *
 * Returns `true` if the request should be rejected.
 *
 * The window is (re-)asserted on every hit rather than only when the counter
 * reads 1. `INCR` on a missing key creates it with no expiry at all, so the
 * `EXPIRE` that follows is what makes the counter temporary — and the two are
 * separate commands. Lose the second one, to a dropped connection or a restart
 * landing between them, and the counter survives for ever: the caller is over
 * the limit permanently, with no way to clear it but deleting the key by hand.
 *
 * `NX` is what makes re-asserting safe. It sets the expiry only when there is
 * none, so the window still runs from the first hit and a caller cannot push it
 * back by trying again — the bug that a plain `EXPIRE` on every hit would
 * introduce while fixing this one.
 *
 * Redis errors are not caught here. Rate limiting that fails open is not rate
 * limiting, and `REDIS_URL` is required configuration for this app.
 */
export async function isRateLimited(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const attempts = await redis.incr(key);
  await redis.expire(key, windowSeconds, "NX");
  return attempts > limit;
}
