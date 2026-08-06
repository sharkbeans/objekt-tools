import { redirect } from "next/navigation";
import { resolveCurrentNicknameForAddress } from "@/lib/cosmo/resolve-nickname";
import {
  UNRESOLVED_WALLET_MARKER,
  UNRESOLVED_WALLET_PARAM,
} from "@/lib/cosmo-username-storage";
import { sectionHref } from "@/lib/sections";

export default async function CollectionWalletRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { address } = await params;
  const resolved = await resolveCurrentNicknameForAddress(address);
  // Cosmo has no wallet -> nickname endpoint, so an address we've never seen
  // (unlinked, no reverse hint) simply can't be named. Fall back to the parent
  // collection page rather than dead-ending on a 404.
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
    `/collection/${encodeURIComponent(resolved.nickname)}${qs ? `?${qs}` : ""}`,
  );
}
