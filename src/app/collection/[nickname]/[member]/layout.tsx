import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { MemberAvatarCarousel } from "@/components/progress/member-avatar-carousel";
import { resolveNickname } from "@/lib/cosmo/resolve-nickname";
import { sectionHref } from "@/lib/sections";

// A layout (rather than page.tsx) so this chrome survives navigation
// between members: Next.js keeps a shared layout mounted across sibling
// route transitions, while the page below it re-renders per member. That's
// what stops the avatar carousel from flashing to a skeleton every time
// someone clicks through to a different member.
export default async function MemberDexLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ nickname: string; member: string }>;
}) {
  const { nickname, member } = await params;
  const resolved = await resolveNickname(nickname);
  if (!resolved) notFound();

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 py-3 space-y-3 sm:py-6 sm:space-y-4">
      <Link
        href={sectionHref(`/collection/${resolved.nickname}`, {
          currentSection: "collect",
        })}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to {resolved.nickname}'s Collection
      </Link>
      <MemberAvatarCarousel
        nickname={resolved.nickname}
        address={resolved.address}
        activeMember={member}
      />
      {children}
    </div>
  );
}
