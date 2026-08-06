import { redirect } from "next/navigation";
import { resolveCurrentNicknameForAddress } from "@/lib/cosmo/resolve-nickname";
import {
  UNRESOLVED_WALLET_MARKER,
  UNRESOLVED_WALLET_PARAM,
} from "@/lib/cosmo-username-storage";
import { resolveMemberCasing } from "@/lib/filters";
import { sectionHref } from "@/lib/sections";

export default async function CollectionWalletMemberRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string; member: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { address, member } = await params;
  const resolved = await resolveCurrentNicknameForAddress(address);
  // Same fallback as the address-only route: an unnameable wallet lands on the
  // parent collection page instead of a 404.
  if (!resolved) {
    redirect(
      sectionHref(
        `/collection?${UNRESOLVED_WALLET_PARAM}=${UNRESOLVED_WALLET_MARKER}`,
        { currentSection: "collect" },
      ),
    );
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }
  const qs = query.toString();
  redirect(
    `/collection/${encodeURIComponent(resolved.nickname)}/${encodeURIComponent(resolveMemberCasing(member) ?? member)}${qs ? `?${qs}` : ""}`,
  );
}
