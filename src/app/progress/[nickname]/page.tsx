import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ClaimBanner } from "@/components/progress/claim-banner";
import { ProgressOverviewContent } from "@/components/progress/progress-overview-content";
import { getSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string }>;
}): Promise<Metadata> {
  const { nickname } = await params;
  return {
    title: `${nickname}'s Collection Progress | objekt.my`,
    description: `View ${nickname}'s Cosmo collection progress.`,
  };
}

export default async function ProgressNicknamePage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const session = await getSession();

  let isViewerLinked = false;
  if (session) {
    const linked = await db.query.cosmoAccount.findFirst({
      where: eq(cosmoAccount.userId, session.user.id),
      columns: { nickname: true },
    });
    isViewerLinked = !!linked?.nickname;
  }

  const showClaimBanner = !session || !isViewerLinked;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      {showClaimBanner && <ClaimBanner isSignedIn={!!session} />}
      <ProgressOverviewContent nickname={nickname} />
    </div>
  );
}
