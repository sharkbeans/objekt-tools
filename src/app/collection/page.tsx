import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CollectionHomeRedirect } from "@/components/progress/collection-home-redirect";
import { getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";
import { sectionHref } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Collection Progress | objekt.my",
  description: "Open your Cosmo collection progress.",
};

export default async function ProgressPage() {
  const session = await getSession();

  let linkedNickname: string | null = null;
  if (session) {
    const linked = await db.query.cosmoAccount.findFirst({
      where: eq(cosmoAccount.userId, session.user.id),
      columns: { nickname: true },
    });
    linkedNickname = linked?.nickname ?? null;
  }

  if (linkedNickname) {
    redirect(
      sectionHref(`/collection/${linkedNickname}`, {
        currentSection: "collect",
      }),
    );
  }

  return <CollectionHomeRedirect />;
}
