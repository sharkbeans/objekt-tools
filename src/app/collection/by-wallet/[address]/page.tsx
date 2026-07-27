import { redirect } from "next/navigation";
import { resolveCurrentNicknameForAddress } from "@/lib/cosmo/resolve-nickname";

// Legacy wallet URLs only: collection links are nickname-based now. Kept so
// old bookmarks and history entries still land somewhere useful.
export default async function CollectionWalletRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { address } = await params;
  const resolved = await resolveCurrentNicknameForAddress(address);
  // No nickname for this wallet (unlinked account, expired reverse hint) —
  // send them to the collection home rather than dead-ending on a 404.
  if (!resolved) redirect("/collection");

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
