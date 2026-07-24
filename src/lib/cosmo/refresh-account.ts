import { eq } from "drizzle-orm";
import { fetchUserProfile } from "@/lib/cosmo/client";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";

// Cosmo nicknames are captured once at link time and never re-synced
// otherwise, so a rename on Cosmo goes unnoticed until the user manually
// unlinks/relinks. Revalidate opportunistically on read, gated by this TTL.
const REFRESH_TTL_MS = 60 * 60 * 1000;

// The nickname/address returned by this endpoint is account-level, not
// artist-specific, so any valid artist works here.
const PROFILE_ARTIST_ID = "tripleS";

type RefreshableAccount = {
  id: number;
  cosmoId: number | null;
  nickname: string | null;
  lastCosmoCheck: Date | null;
};

// Re-checks the account's nickname against the live Cosmo API if the last
// check is missing or older than REFRESH_TTL_MS, updating the DB row in
// place. Returns the account with fresh nickname/lastCosmoCheck fields.
// Best-effort: Cosmo being unreachable never throws, it just leaves the
// nickname as-is and stamps lastCosmoCheck so we don't retry every request.
export async function refreshCosmoAccountIfStale<T extends RefreshableAccount>(
  account: T,
  maxAgeMs = REFRESH_TTL_MS,
): Promise<T> {
  if (!account.cosmoId) return account;

  const isStale =
    !account.lastCosmoCheck ||
    Date.now() - account.lastCosmoCheck.getTime() > maxAgeMs;
  if (!isStale) return account;

  const now = new Date();
  try {
    const profile = await fetchUserProfile(account.cosmoId, PROFILE_ARTIST_ID);
    await db
      .update(cosmoAccount)
      .set({ nickname: profile.nickname, lastCosmoCheck: now })
      .where(eq(cosmoAccount.id, account.id));
    return { ...account, nickname: profile.nickname, lastCosmoCheck: now };
  } catch {
    try {
      await db
        .update(cosmoAccount)
        .set({ lastCosmoCheck: now })
        .where(eq(cosmoAccount.id, account.id));
    } catch {}
    return { ...account, lastCosmoCheck: now };
  }
}
