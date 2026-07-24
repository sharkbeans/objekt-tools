import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MemberDexContent } from "@/components/progress/member-dex-content";
import { resolveNickname } from "@/lib/cosmo/resolve-nickname";
import { resolveMemberCasing } from "@/lib/filters";
import {
  getProgressMemberCatalog,
  toPublicProgressMemberCatalog,
} from "@/lib/progress/member-catalog";
import { sectionAbsoluteUrl } from "@/lib/sections";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ nickname: string; member: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { nickname, member } = await params;
  const sp = await searchParams;
  const isGridView = sp.view === "grid";
  // Grid tab's season filter — kept in sync with this param by
  // member-dex-content.tsx so a link shared while viewing an older season's
  // grid (e.g. ?view=grid&season=Binary02) carries that season through to
  // both the OG image and the link Discord/etc. actually opens, instead of
  // always falling back to the latest season.
  const season = isGridView && typeof sp.season === "string" ? sp.season : null;
  // Cache-busting token from a "Share link" click (grid-section.tsx). Discord
  // caches the og:image separately from the page's own metadata, so even a
  // freshly-fetched page can still point at a stale cached image — carrying
  // the same token into the image URL makes that fetch look unseen too.
  const shareToken = typeof sp.share === "string" ? sp.share : null;
  const title = `${nickname}'s ${member} Collection | objekt.my`;
  const description = `View ${nickname}'s ${member} objekt collection.`;
  const basePath = `/collection/${nickname}/${member}`;
  // Canonical stays param-free (SEO: one indexable URL per member, not one
  // per filter combination). The share link below is allowed to diverge
  // from it since it's describing "this exact view", not "this page".
  const canonical = sectionAbsoluteUrl(basePath);

  const shareQuery = new URLSearchParams();
  if (isGridView) shareQuery.set("view", "grid");
  if (season) shareQuery.set("season", season);
  const shareSuffix = shareQuery.size > 0 ? `?${shareQuery}` : "";
  const shareUrl = sectionAbsoluteUrl(`${basePath}${shareSuffix}`);

  // URL only — no progress/DB/Cosmo work here. The OG route fetches and
  // caches its own data on the request Discord/etc. makes for the image,
  // not on every page navigation.
  const ogImageQuery = new URLSearchParams();
  if (season) ogImageQuery.set("season", season);
  if (shareToken) ogImageQuery.set("share", shareToken);
  const ogImageSuffix = ogImageQuery.size > 0 ? `?${ogImageQuery}` : "";
  const ogPath = isGridView
    ? `${basePath}/og/grid${ogImageSuffix}`
    : `${basePath}/og${ogImageSuffix}`;
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
      url: shareUrl,
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
  const resolved = await resolveNickname(nickname);
  if (!resolved) notFound();

  const canonicalMember = resolveMemberCasing(member);
  if (!canonicalMember) notFound();
  const canonicalNickname = resolved.nickname;
  if (canonicalNickname !== nickname || canonicalMember !== member) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      if (Array.isArray(value)) {
        for (const v of value) query.append(key, v);
      } else if (value !== undefined) {
        query.append(key, value);
      }
    }
    const qs = query.toString();
    redirect(
      `/collection/${encodeURIComponent(canonicalNickname)}/${encodeURIComponent(canonicalMember)}${qs ? `?${qs}` : ""}`,
    );
  }

  const catalog = toPublicProgressMemberCatalog(
    await getProgressMemberCatalog(canonicalMember),
  );
  const initialSeason = catalog.collections.at(-1)?.season;
  const initialCatalog = {
    ...catalog,
    collections: initialSeason
      ? catalog.collections.filter(
          (collection) => collection.season === initialSeason,
        )
      : [],
  };
  const availableSeasons = [
    ...new Set(catalog.collections.map((collection) => collection.season)),
  ];

  return (
    <MemberDexContent
      key={`${resolved.address.toLowerCase()}:${canonicalMember}`}
      nickname={canonicalNickname}
      address={resolved.address}
      member={canonicalMember}
      initialCatalog={initialCatalog}
      availableSeasons={availableSeasons}
    />
  );
}
