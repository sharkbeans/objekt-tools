import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MemberDexContent } from "@/components/progress/member-dex-content";
import { resolveMemberCasing } from "@/lib/filters";
import { sectionAbsoluteUrl } from "@/lib/sections";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string; member: string }>;
}): Promise<Metadata> {
  const { nickname, member } = await params;
  return {
    title: `${nickname}'s ${member} Collection | objekt.my`,
    description: `View ${nickname}'s ${member} objekt collection.`,
    alternates: {
      canonical: sectionAbsoluteUrl(`/collection/${nickname}/${member}`),
    },
  };
}

export default async function MemberDexPage({
  params,
  searchParams,
}: {
  params: Promise<{ nickname: string; member: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { nickname, member } = await params;

  const canonicalMember = resolveMemberCasing(member);
  if (canonicalMember && canonicalMember !== member) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      if (Array.isArray(value)) {
        for (const v of value) query.append(key, v);
      } else if (value !== undefined) {
        query.append(key, value);
      }
    }
    const qs = query.toString();
    redirect(`/collection/${nickname}/${canonicalMember}${qs ? `?${qs}` : ""}`);
  }

  return <MemberDexContent nickname={nickname} member={member} />;
}
