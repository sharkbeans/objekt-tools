import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MemberDexContent } from "@/components/progress/member-dex-content";
import { sectionAbsoluteUrl, sectionHref } from "@/lib/sections";

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
}: {
  params: Promise<{ nickname: string; member: string }>;
}) {
  const { nickname, member } = await params;

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 py-3 space-y-3 sm:py-6 sm:space-y-4">
      <Link
        href={sectionHref(`/collection/${nickname}`, {
          currentSection: "collect",
        })}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to {nickname}'s Collection
      </Link>
      <MemberDexContent nickname={nickname} member={member} />
    </div>
  );
}
