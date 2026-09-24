import { eq, sql } from "drizzle-orm";
import { fetchUserByNickname } from "@/lib/cosmo/client";
import { refreshCosmoAccountIfStale } from "@/lib/cosmo/refresh-account";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";

// Shared by the public profile API route, the profile page's generateMetadata,
// and the profile OG image — all three need the same "who is this" answer,
// and previously only the API route knew how to compute it. (Trade reputation
// stats were dropped with the trades retirement — plan 039.)

export const PROFILE_USER_COLUMNS = {
  id: true,
  name: true,
  image: true,
  email: true,
  discordId: true,
  discordUsername: true,
} as const;

export type ProfileCosmoRow = Awaited<
  ReturnType<
    typeof db.query.cosmoAccount.findFirst<{
      with: { user: { columns: typeof PROFILE_USER_COLUMNS } };
    }>
  >
>;

export function isWalletAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Resolve a wallet address or Cosmo nickname to a profile.
 *
 * `redirect` means the caller is at a non-canonical URL (an address for an
 * account that has a nickname, or a nickname the account has since renamed
 * away from) and should send the visitor to `/@{nickname}`.
 *
 * `refresh` revalidates the cached nickname against the live Cosmo API. The
 * API route wants that; generateMetadata and the OG route do not, since a
 * per-render external call would sit in the page's critical path.
 */
export async function resolveProfileIdentity(
  identifier: string,
  { refresh = true }: { refresh?: boolean } = {},
): Promise<
  | { kind: "linked"; cosmo: NonNullable<ProfileCosmoRow> }
  | { kind: "redirect"; nickname: string }
  | { kind: "unlinked"; address: string; nickname: string }
  | { kind: "not-found" }
  | { kind: "cosmo-unavailable" }
> {
  const withUser = { user: { columns: PROFILE_USER_COLUMNS } } as const;

  if (isWalletAddress(identifier)) {
    let cosmo = await db.query.cosmoAccount.findFirst({
      where: eq(cosmoAccount.address, identifier.toLowerCase()),
      with: withUser,
    });
    if (!cosmo) return { kind: "not-found" };
    if (refresh) cosmo = await refreshCosmoAccountIfStale(cosmo);
    // Prefer the prettier /@nickname URL when the account has one.
    if (cosmo.nickname) return { kind: "redirect", nickname: cosmo.nickname };
    return { kind: "linked", cosmo };
  }

  // Nickname. Compared with lower() rather than ilike: "_" and "%" are LIKE
  // wildcards and both are legal in a Cosmo nickname, so ilike would let
  // "/@some_user" match a different account that happens to fit the pattern.
  let cosmo = await db.query.cosmoAccount.findFirst({
    where: sql`lower(${cosmoAccount.nickname}) = lower(${identifier})`,
    with: withUser,
  });

  if (!cosmo) {
    if (!refresh) return { kind: "not-found" };
    // Fall back to Cosmo to resolve nickname → address for accounts that have
    // never linked objekt.my.
    let resolved: { nickname: string; address: string } | null;
    try {
      resolved = await fetchUserByNickname(identifier);
    } catch (error) {
      console.error("Failed to resolve Cosmo user profile:", error);
      return { kind: "cosmo-unavailable" };
    }
    if (!resolved) return { kind: "not-found" };
    return {
      kind: "unlinked",
      address: resolved.address.toLowerCase(),
      nickname: resolved.nickname,
    };
  }

  if (refresh) {
    // Revalidate: the lookup above matched on a possibly outdated nickname.
    cosmo = await refreshCosmoAccountIfStale(cosmo);
    if (
      cosmo.nickname &&
      cosmo.nickname.toLowerCase() !== identifier.toLowerCase()
    ) {
      return { kind: "redirect", nickname: cosmo.nickname };
    }
  }

  return { kind: "linked", cosmo };
}

export type ProfileCard = {
  linked: boolean;
  nickname: string | null;
  address: string | null;
  linkedAt: Date | null;
};

/**
 * Display-ready profile summary for generateMetadata and the OG image.
 *
 * DB-only by design: an unlinked Cosmo user has nothing extra to show, so paying
 * for a Cosmo API round-trip on every page render (and every Discord embed
 * fetch) would buy nothing but latency. Callers fall back to a generic card
 * when this returns null.
 */
export async function loadProfileCard(
  identifier: string,
): Promise<ProfileCard | null> {
  const result = await resolveProfileIdentity(identifier, { refresh: false });
  if (result.kind !== "linked") return null;

  const { cosmo } = result;

  return {
    linked: true,
    nickname: cosmo.nickname ?? null,
    address: cosmo.address,
    linkedAt: cosmo.linkedAt,
  };
}
