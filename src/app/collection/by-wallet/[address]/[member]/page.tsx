import { notFound, redirect } from "next/navigation";
import { resolveCurrentNicknameForAddress } from "@/lib/cosmo/resolve-nickname";
import { resolveMemberCasing } from "@/lib/filters";

export default async function CollectionWalletMemberRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string; member: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { address, member } = await params;
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
    `/collection/${encodeURIComponent(resolved.nickname)}/${encodeURIComponent(resolveMemberCasing(member) ?? member)}${qs ? `?${qs}` : ""}`,
  );
}
