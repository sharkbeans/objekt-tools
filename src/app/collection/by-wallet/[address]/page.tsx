import { notFound, redirect } from "next/navigation";
import { resolveCurrentNicknameForAddress } from "@/lib/cosmo/resolve-nickname";

export default async function CollectionWalletRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { address } = await params;
  const resolved = await resolveCurrentNicknameForAddress(address);
  if (!resolved) notFound();

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
