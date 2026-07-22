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
    columns: { id: true, description: true, updatedAt: true },
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

  const rawDescription = trade?.description?.trim();
  const description = rawDescription
    ? rawDescription.length > 200
      ? `${rawDescription.slice(0, 197)}…`
      : rawDescription
    : "Trade Cosmo objekts on objekt.my";

  const canonical = sectionAbsoluteUrl(`/trades/${id}`);
  // Bump the cached embed past Discord/social caches whenever the trade
  // changes; append a static "-N" suffix if the OG route's rendering changes
  // without a trade edit to naturally invalidate it.
  const version = trade?.updatedAt?.getTime() ?? 0;
  const ogUrl = sectionAbsoluteUrl(`/trades/${id}/og?v=${version}`);
  const ogImage = { url: ogUrl, width: 1200, height: 630, type: "image/png" };

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
      images: trade ? [ogImage] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: trade ? [ogImage] : undefined,
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
