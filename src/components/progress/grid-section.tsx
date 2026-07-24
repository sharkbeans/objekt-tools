"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { shareOrDownloadBlob } from "@/lib/download-canvas";
import type { Edition } from "@/lib/edition";
import { getCollectionEdition } from "@/lib/edition";
import type { ProgressCollection } from "@/lib/progress/types";
import { sectionAbsoluteUrl } from "@/lib/sections";
import { GridBoard } from "./grid-board";
import { ObjektScanStatus } from "./objekt-scan-status";
import { ShareButton } from "./share-dialog";

interface Props {
  member: string;
  season: string;
  collections: ProgressCollection[];
  address: string;
  nickname: string;
  viewConsumed: boolean;
  ownershipLoaded: boolean;
  tradabilityLoaded: boolean;
}

interface GridRankResponse {
  count: number;
  rank: number | null;
  totalCrafters: number;
  percentile: number | null;
}

const EDITIONS: Edition[] = [1, 2, 3];

/**
 * Rank tag tier for the top-10 leaderboard shimmer: #1 gold, #2 silver,
 * #3-10 bronze (same t-serial-rare sweep as the objekt low-serial badges,
 * just a wider bronze band since a rank of 10 is still noteworthy).
 */
function rankTierClass(rank: number) {
  if (rank === 1) return " t-serial-rare t-serial-gold";
  if (rank === 2) return " t-serial-rare t-serial-silver";
  if (rank <= 10) return " t-serial-rare t-serial-bronze";
  return "";
}

function GridRankBadge({
  address,
  nickname,
  member,
  season,
}: {
  address: string;
  nickname: string;
  member: string;
  season: string;
}) {
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => setClientReady(true), []);

  const rankQuery = useQuery<GridRankResponse>({
    queryKey: ["grid-rank", "address", address.toLowerCase(), member, season],
    queryFn: async () => {
      const res = await fetch(
        `/api/progress/${encodeURIComponent(nickname)}/${encodeURIComponent(member)}/grid-rank?season=${encodeURIComponent(season)}`,
      );
      if (!res.ok) throw new Error("Failed to load grid rank");
      return res.json();
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const data = clientReady ? rankQuery.data : undefined;
  const isPending = !clientReady || rankQuery.isPending;

  if (isPending) {
    return <ObjektScanStatus compact label="Updating rank…" />;
  }
  if (!data || data.rank === null || data.count === 0) return null;

  const rankText = `#${data.rank}`;

  return (
    <span className="text-base text-muted-foreground">
      {data.rank <= 10 ? (
        <span
          className={`relative mr-1 inline-block overflow-hidden rounded bg-black/70 px-1.5 py-0.5 align-middle font-mono text-base font-semibold leading-none text-white${rankTierClass(data.rank)}`}
        >
          {rankText}
        </span>
      ) : (
        <span className="mr-1">{rankText}</span>
      )}
      of {data.totalCrafters} crafters this season · top{" "}
      <span className="font-bold text-white">{data.percentile}%</span>
    </span>
  );
}

function GridShareButton({
  nickname,
  member,
  season,
}: {
  nickname: string;
  member: string;
  season: string;
}) {
  const [generatingImage, setGeneratingImage] = useState(false);

  // Discord (and most link-unfurlers) cache a URL's embed for a while after
  // the first fetch, and cache the referenced og:image separately from the
  // page metadata — so re-sharing the same clean URL later can still show a
  // stale rank/image. Appending a one-off token to both the page URL and the
  // og:image URL makes each "Share link" click look unseen to both caches,
  // forcing a fresh fetch. The token is stripped from the address bar right
  // after landing (see member-dex-content.tsx) — it has no purpose beyond
  // that first fetch.
  const handleShareLink = async () => {
    const token = Math.random().toString(36).slice(2, 8);
    const params = new URLSearchParams({
      view: "grid",
      season,
      share: token,
    });
    const url = sectionAbsoluteUrl(
      `/collection/${encodeURIComponent(nickname)}/${encodeURIComponent(member)}?${params}`,
    );
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  // Reuses the same PNG the og:image tag serves rather than re-rendering the
  // board client-side — one less code path to keep visually in sync with
  // grid-board.tsx.
  const handleGenerateImage = async () => {
    setGeneratingImage(true);
    try {
      const res = await fetch(
        `/collection/${encodeURIComponent(nickname)}/${encodeURIComponent(member)}/og/grid?season=${encodeURIComponent(season)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to generate image");
      const blob = await res.blob();
      const outcome = await shareOrDownloadBlob(
        blob,
        `${member}-${season}-grid-${Date.now()}.png`,
      );
      if (outcome === "shared") toast.success("Image shared!");
      else if (outcome === "downloaded") toast.success("Image downloaded!");
    } catch {
      toast.error("Couldn't generate image");
    } finally {
      setGeneratingImage(false);
    }
  };

  return (
    <ShareButton
      onShareLink={handleShareLink}
      onGenerateImage={handleGenerateImage}
      generatingImage={generatingImage}
    />
  );
}

export function GridSection({
  member,
  season,
  collections,
  address,
  nickname,
  viewConsumed,
  ownershipLoaded,
  tradabilityLoaded,
}: Props) {
  const byEdition = useMemo(() => {
    const map = new Map<
      Edition,
      { firsts: ProgressCollection[]; specials: ProgressCollection[] }
    >();
    for (const c of collections) {
      const edition = getCollectionEdition({
        artist: c.artist,
        class: c.class,
        onOffline: c.onOffline,
        collectionNo: c.collectionNo,
        season: c.season,
      });
      if (!edition) continue;
      const entry = map.get(edition) ?? { firsts: [], specials: [] };
      if (c.class === "First") entry.firsts.push(c);
      else if (c.class === "Special") entry.specials.push(c);
      map.set(edition, entry);
    }
    for (const entry of map.values()) {
      entry.firsts.sort((a, b) =>
        a.collectionNo.localeCompare(b.collectionNo, undefined, {
          numeric: true,
        }),
      );
      entry.specials.sort((a, b) =>
        a.collectionNo.localeCompare(b.collectionNo, undefined, {
          numeric: true,
        }),
      );
    }
    return map;
  }, [collections]);

  const editionsWithData = EDITIONS.filter(
    (e) => (byEdition.get(e)?.firsts.length ?? 0) > 0,
  );

  if (editionsWithData.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="font-semibold text-xl">{season}</h3>
          <GridRankBadge
            address={address}
            nickname={nickname}
            member={member}
            season={season}
          />
        </div>
        <GridShareButton nickname={nickname} member={member} season={season} />
      </div>
      <div className="flex flex-wrap items-stretch gap-8">
        {editionsWithData.map((edition, i) => {
          const entry = byEdition.get(edition);
          if (!entry) return null;
          return (
            <Fragment key={edition}>
              {i > 0 && (
                <div className="hidden w-px shrink-0 self-stretch bg-border sm:block" />
              )}
              <GridBoard
                edition={edition}
                firsts={entry.firsts}
                specials={entry.specials}
                address={address}
                nickname={nickname}
                seasonCollections={collections}
                viewConsumed={viewConsumed}
                ownershipLoaded={ownershipLoaded}
                tradabilityLoaded={tradabilityLoaded}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
