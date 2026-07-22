import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MemberDexContent } from "@/components/progress/member-dex-content";
import { resolveMemberCasing } from "@/lib/filters";
import { sectionAbsoluteUrl } from "@/lib/sections";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ nickname: string; member: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { nickname, member } = await params;
  const isGridView = (await searchParams).view === "grid";
  const title = `${nickname}'s ${member} Collection | objekt.my`;
  const description = `View ${nickname}'s ${member} objekt collection.`;
  const canonical = sectionAbsoluteUrl(`/collection/${nickname}/${member}`);
  // URL only — no progress/DB/Cosmo work here. The OG route fetches and
  // caches its own data on the request Discord/etc. makes for the image,
  // not on every page navigation.
  const ogPath = isGridView
    ? `/collection/${nickname}/${member}/og/grid`
    : `/collection/${nickname}/${member}/og`;
  const ogImage = {
    url: sectionAbsoluteUrl(ogPath),
    width: 1200,
    height: 630,
    type: "image/png",
  };

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
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
