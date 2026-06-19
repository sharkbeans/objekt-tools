import { ilike } from "drizzle-orm";
import { fetchUserByNickname } from "@/lib/cosmo/client";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";
import { redis } from "@/lib/redis";

const RESERVED_NICKNAMES = new Set(["cosmo-spin"]);

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
): Promise<{ address: string; nickname: string } | null> {
  if (RESERVED_NICKNAMES.has(nickname.toLowerCase())) return null;

  const linked = await db.query.cosmoAccount.findFirst({
    where: ilike(cosmoAccount.nickname, nickname),
    columns: { address: true, nickname: true },
  });

  if (linked) {
    return {
      address: linked.address.toLowerCase(),
      nickname: linked.nickname ?? nickname,
    };
  }

  const cacheKey = `cosmo:nickname:notfound:${nickname.toLowerCase()}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return null;
  } catch {}

  let resolved: { nickname: string; address: string } | null;
  try {
    resolved = await fetchUserByNickname(nickname);
  } catch {
    // Transient upstream error — don't poison the negative cache. Signal the
    // caller to return a 503 so clients retry, rather than a misleading 404.
    throw new CosmoUnavailableError();
  }

  if (!resolved) {
    try {
      await redis.set(cacheKey, "1", "EX", 3600);
    } catch {}
    return null;
  }

  return {
    address: resolved.address.toLowerCase(),
    nickname: resolved.nickname,
  };
}
