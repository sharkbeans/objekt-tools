import { ilike } from "drizzle-orm";
import { fetchUserByNickname } from "@/lib/cosmo/client";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";
import { redis } from "@/lib/redis";

const RESERVED_NICKNAMES = new Set(["cosmo-spin"]);

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

  const resolved = await fetchUserByNickname(nickname);
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
