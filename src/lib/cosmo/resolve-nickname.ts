import { ilike } from "drizzle-orm";
import { fetchUserByNickname } from "@/lib/cosmo/client";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";

export function validateNickname(nickname: string): boolean {
  return nickname.length >= 1 && nickname.length <= 30 && !/\s/.test(nickname);
}

export async function resolveNickname(
  nickname: string,
): Promise<{ address: string; nickname: string } | null> {
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

  const resolved = await fetchUserByNickname(nickname);
  if (!resolved) return null;

  return {
    address: resolved.address.toLowerCase(),
    nickname: resolved.nickname,
  };
}
