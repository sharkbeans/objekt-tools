import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ProgressSearch } from "@/components/progress/progress-search";
import { getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";
import { sectionHref } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Collection Progress | objekt.my",
  description: "Track your Cosmo collection progress.",
};

export default async function ProgressPage() {
  const session = await getSession();

  let linkedNickname: string | undefined;
  if (session) {
    const linked = await db.query.cosmoAccount.findFirst({
      where: eq(cosmoAccount.userId, session.user.id),
      columns: { nickname: true },
    });
    linkedNickname = linked?.nickname ?? undefined;
  }

  return (
    <div className="max-w-xl mx-auto py-12 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Collection</h1>
        <p className="text-muted-foreground mt-1">
          Look up any Cosmo user to see their collection progress.
        </p>
      </div>
      <ProgressSearch defaultNickname={linkedNickname} />
      {session && !linkedNickname && (
        <p className="text-sm text-muted-foreground">
          Want to see your own dex?{" "}
          <Link href={sectionHref("/link")} className="underline hover:text-foreground">
            Link your Cosmo account
          </Link>
          .
        </p>
      )}
    </div>
  );
}
