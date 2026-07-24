import { eq } from "drizzle-orm";
import { fetchUserByNickname } from "@/lib/cosmo/client";
import { refreshCosmoAccountIfStale } from "@/lib/cosmo/refresh-account";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";
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
    },
  );
}

/**
 * Resolve the best currently-known nickname for a stable wallet URL, then
 * verify that Cosmo still maps that nickname back to the same wallet. Linked
 * accounts can follow renames through their stable Cosmo id; recently viewed
 * public accounts use the reverse hint populated by resolveNickname().
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
