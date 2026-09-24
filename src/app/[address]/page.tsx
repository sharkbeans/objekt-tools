import type { Metadata } from "next";
import { loadProfileCard } from "@/lib/profile/profile-summary";
import { decodeRouteParam } from "@/lib/route-params";
import { rootUrl } from "@/lib/sections";
import { ProfileClient } from "./profile-client";

function identifierFrom(raw: string): string {
  const decoded = decodeRouteParam(raw);
  return decoded.startsWith("@") ? decoded.slice(1) : decoded;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address: raw } = await params;
  const identifier = identifierFrom(raw);

  if (!identifier.trim()) {
    return { title: "Page not found | objekt.my" };
  }

  // Profiles are root-only paths (see ROOT_ONLY_PREFIXES), so these URLs are
  // always on the root host — no section resolution needed.
  const canonical = `${rootUrl()}/@${encodeURIComponent(identifier)}`;
  const card = await loadProfileCard(identifier);
  const displayName = card?.nickname ?? identifier;

  const title = `@${displayName} | objekt.my`;
  const description = `View @${displayName}'s Cosmo collection and grid progress on objekt.my.`;

  // Cache-bust the embed when the card changes (linking the account, or the
  // trade-stats layout it used to carry, dropped in plan 039).
  const version = card?.linked ? "linked-2" : "0";
  const ogImage = {
    url: `${rootUrl()}/@${encodeURIComponent(identifier)}/og?v=${version}`,
    width: 1200,
    height: 630,
    type: "image/png",
  };

  return {
    title,
    description,
    alternates: { canonical },
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

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  return <ProfileClient params={params} />;
}
