import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { tradePost } from "@/lib/db/schema";
import { sectionAbsoluteUrl } from "@/lib/sections";
import TradeDetailClient from "./trade-detail-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const trade = await db.query.tradePost.findFirst({
    where: eq(tradePost.id, id),
    columns: { id: true },
    with: {
      user: {
        columns: {},
        with: {
          cosmoAccount: { columns: { nickname: true } },
        },
      },
    },
  });

  const nickname = trade?.user?.cosmoAccount?.nickname;
  const title = nickname
    ? `View @${nickname}'s Trade | objekt.my`
    : `Trade #${id} | objekt.my`;

  return {
    title,
    description: "",
    alternates: {
      canonical: sectionAbsoluteUrl(`/trades/${id}`),
    },
    openGraph: {
      title,
      description: "",
      url: sectionAbsoluteUrl(`/trades/${id}`),
    },
  };
}

export default function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <TradeDetailClient params={params} />;
}
