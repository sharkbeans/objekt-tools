import { eq } from "drizzle-orm";
import { fetchUserByNickname, searchUsers } from "@/lib/cosmo/client";
import {
  fetchCurrentNickname,
  refreshCosmoAccountIfStale,
} from "@/lib/cosmo/refresh-account";
import { db } from "@/lib/db";
import { cosmoAccount, cosmoUserCache } from "@/lib/db/schema";
import { redis } from "@/lib/redis";
import { getCached } from "@/lib/server-cache";

const RESERVED_NICKNAMES = new Set(["cosmo-spin"]);
const RESOLVED_NICKNAME_TTL_SECONDS = 5 * 60;
const NOT_FOUND_NICKNAME_TTL_SECONDS = 5 * 60;
const RESOLVED_NICKNAME_TTL_MS = RESOLVED_NICKNAME_TTL_SECONDS * 1000;
// Reverse hints are tiny and always revalidated nickname -> address before
// use, so keep them long enough for an old bookmark/last-viewed wallet to
// remain useful without letting the hint itself establish ownership.
const REVERSE_NICKNAME_TTL_SECONDS = 365 * 24 * 60 * 60;
const ADDRESS_LOOKUP_MAX_AGE_MS = 5 * 60_000;
const COSMO_ID_RETRY_MS = 60 * 60_000;

type ResolvedNickname = {
  address: string;
  nickname: string;
};

function parseCachedResolution(value: string): ResolvedNickname | null {
  try {
    const parsed = JSON.parse(value) as Partial<ResolvedNickname>;
    if (
      typeof parsed.address !== "string" ||
      typeof parsed.nickname !== "string"
    ) {
      return null;
    }
    return {
      address: parsed.address.toLowerCase(),
      nickname: parsed.nickname,
    };
  } catch {
    return null;
  }
}

// Cosmo's by-nickname endpoint doesn't return the numeric user id, so pick it
// up from search the first time we see a wallet. Best-effort: without it the
// wallet simply stays nickname-only and can't follow a future rename.
async function lookupCosmoId(
  nickname: string,
  address: string,
): Promise<number | null> {
  try {
    const { results } = await searchUsers(nickname);
    const match = results.find((r) => r.address.toLowerCase() === address);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

// Persist a resolution so an address lookup still works after Redis loses the
// reverse hint. Never overwrites a known cosmoId with null.
async function rememberCosmoUser(resolved: ResolvedNickname): Promise<void> {
  try {
    const existing = await db.query.cosmoUserCache.findFirst({
      where: eq(cosmoUserCache.address, resolved.address),
      columns: { cosmoId: true, lastCosmoCheck: true },
    });
    // Search is an extra round trip, so only spend it on a wallet we've never
    // seen — or on one whose id we've failed to capture for a while.
    const retryCosmoId =
      !existing ||
      (existing.cosmoId === null &&
        Date.now() - existing.lastCosmoCheck.getTime() > COSMO_ID_RETRY_MS);
    const cosmoId = retryCosmoId
      ? await lookupCosmoId(resolved.nickname, resolved.address)
      : existing.cosmoId;

    await db
      .insert(cosmoUserCache)
      .values({
        address: resolved.address,
        nickname: resolved.nickname,
        cosmoId,
        lastCosmoCheck: new Date(),
      })
      .onConflictDoUpdate({
        target: cosmoUserCache.address,
        set: {
          nickname: resolved.nickname,
          cosmoId,
          lastCosmoCheck: new Date(),
        },
      });
  } catch {}
}

/**
 * Thrown when nickname resolution fails because Cosmo is unreachable
 * (timeout, 5xx, token-refresh failure) — as opposed to the user genuinely
 * not existing. Callers should map this to a 503, not a 404.
 */
export class CosmoUnavailableError extends Error {
  constructor() {
    super("Cosmo is temporarily unavailable");
    this.name = "CosmoUnavailableError";
  }
}

export function validateNickname(nickname: string): boolean {
  return nickname.length >= 1 && nickname.length <= 30 && !/\s/.test(nickname);
}

export async function resolveNickname(
  nickname: string,
): Promise<ResolvedNickname | null> {
  if (!validateNickname(nickname)) return null;
  const normalizedNickname = nickname.toLowerCase();
  if (RESERVED_NICKNAMES.has(normalizedNickname)) return null;

  return getCached(
    `cosmo:nickname:resolved:v2:${normalizedNickname}`,
    RESOLVED_NICKNAME_TTL_MS,
    async () => {
      // Persist on every load, not just on a live Cosmo fetch: the Redis
      // fast path would otherwise keep the durable mapping from ever being
      // written, which is exactly the row an address lookup falls back to.
      const resolved = await loadResolvedNickname(nickname, normalizedNickname);
      if (resolved) await rememberCosmoUser(resolved);
      return resolved;
    },
  );
}

async function loadResolvedNickname(
  nickname: string,
  normalizedNickname: string,
): Promise<ResolvedNickname | null> {
  const resolvedCacheKey = `cosmo:nickname:resolved:v2:${normalizedNickname}`;
  const notFoundCacheKey = `cosmo:nickname:notfound:v2:${normalizedNickname}`;
  try {
    const [cachedResolved, cachedNotFound] = await redis.mget(
      resolvedCacheKey,
      notFoundCacheKey,
    );
    if (cachedResolved) {
      const parsed = parseCachedResolution(cachedResolved);
      if (parsed) return parsed;
    }
    if (cachedNotFound) return null;
  } catch {}

  let resolved: { nickname: string; address: string } | null;
  try {
    resolved = await fetchUserByNickname(nickname);
  } catch {
    // Transient upstream error — don't poison the negative cache. Signal
    // the caller to return a 503 so clients retry, rather than a
    // misleading 404.
    throw new CosmoUnavailableError();
  }

  if (!resolved) {
    try {
      await redis.set(
        notFoundCacheKey,
        "1",
        "EX",
        NOT_FOUND_NICKNAME_TTL_SECONDS,
      );
    } catch {}
    return null;
  }

  const normalizedResolved = {
    address: resolved.address.toLowerCase(),
    nickname: resolved.nickname,
  };
  try {
    await Promise.all([
      redis.set(
        resolvedCacheKey,
        JSON.stringify(normalizedResolved),
        "EX",
        RESOLVED_NICKNAME_TTL_SECONDS,
      ),
      redis.set(
        `cosmo:address:last-nickname:v2:${normalizedResolved.address}`,
        normalizedResolved.nickname,
        "EX",
        REVERSE_NICKNAME_TTL_SECONDS,
      ),
      redis.del(notFoundCacheKey),
    ]);
  } catch {}
  return normalizedResolved;
}

// Re-checks a cached wallet against Cosmo's stable user id when the row is
// older than maxAgeMs, so a rename is picked up on the next lookup. Mirrors
// refreshCosmoAccountIfStale() for wallets nobody has linked.
async function refreshCachedUserIfStale(row: {
  address: string;
  nickname: string;
  cosmoId: number | null;
  lastCosmoCheck: Date;
}): Promise<string> {
  if (!row.cosmoId) return row.nickname;
  if (Date.now() - row.lastCosmoCheck.getTime() <= ADDRESS_LOOKUP_MAX_AGE_MS) {
    return row.nickname;
  }

  const current = await fetchCurrentNickname(row.cosmoId);
  try {
    await db
      .update(cosmoUserCache)
      .set({ nickname: current ?? row.nickname, lastCosmoCheck: new Date() })
      .where(eq(cosmoUserCache.address, row.address));
  } catch {}
  return current ?? row.nickname;
}

/**
 * Resolve the wallet a collection is stored under to the nickname the account
 * carries *right now*, then verify Cosmo still maps that nickname back to the
 * same wallet. The wallet is the stable identity and the nickname is a mutable
 * label, so this is what keeps a saved collection working across a Cosmo
 * rename — callers redirect to the nickname, which is all the URL ever shows.
 *
 * Candidates, most authoritative first: a linked account's stable Cosmo id,
 * the durable cosmo_user_cache row (itself refreshed through that same id when
 * we captured one), then Redis' reverse hint as a fast path.
 */
export async function resolveCurrentNicknameForAddress(
  address: string,
): Promise<ResolvedNickname | null> {
  const normalizedAddress = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalizedAddress)) return null;

  const candidates: string[] = [];
  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.address, normalizedAddress),
    columns: {
      id: true,
      cosmoId: true,
      nickname: true,
      lastCosmoCheck: true,
    },
  });
  if (linked) {
    const refreshed = await refreshCosmoAccountIfStale(
      linked,
      ADDRESS_LOOKUP_MAX_AGE_MS,
    );
    if (refreshed.nickname) candidates.push(refreshed.nickname);
  }

  try {
    const cached = await db.query.cosmoUserCache.findFirst({
      where: eq(cosmoUserCache.address, normalizedAddress),
    });
    if (cached) candidates.push(await refreshCachedUserIfStale(cached));
  } catch {}

  try {
    const reverseHint = await redis.get(
      `cosmo:address:last-nickname:v2:${normalizedAddress}`,
    );
    if (reverseHint) candidates.push(reverseHint);
  } catch {}

  for (const candidate of new Set(candidates)) {
    const resolved = await resolveNickname(candidate);
    if (resolved?.address === normalizedAddress) return resolved;
  }

  return null;
}
