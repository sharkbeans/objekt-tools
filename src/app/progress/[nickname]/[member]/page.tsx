import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MemberDexContent } from "@/components/progress/member-dex-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string; member: string }>;
}): Promise<Metadata> {
  const { nickname, member } = await params;
  return {
    title: `${nickname}'s ${member} Collection | objekt.my`,
    description: `View ${nickname}'s ${member} objekt collection.`,
  };
}

export default async function MemberDexPage({
  params,
}: {
  params: Promise<{ nickname: string; member: string }>;
}) {
  const { nickname, member } = await params;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-4">
      <Link
        href={`/progress/${nickname}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to {nickname}'s Collection
      </Link>
      <MemberDexContent nickname={nickname} member={member} />
    </div>
  );
}
