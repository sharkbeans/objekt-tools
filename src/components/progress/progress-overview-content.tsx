"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, ShareIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  defaultFilters,
  ObjektFilterBar,
  type ObjektFilterState,
} from "@/components/objekt/objekt-filter-bar";
import { Button } from "@/components/ui/button";
import { useProgressOverview } from "@/hooks/use-progress-overview";
import { normalizeArtistId } from "@/lib/artist-utils";
import { storeCosmoUsername } from "@/lib/cosmo-username-storage";
import { shareOrDownloadCanvas } from "@/lib/download-canvas";
import { decodeGroupedValue } from "@/lib/filter-utils";
import { realMembersByArtist, type ValidArtist } from "@/lib/filters";
import { renderProgressCardToCanvas } from "@/lib/progress/progress-card-render";
import type { ProgressRollup } from "@/lib/progress/types";
import { MemberProgressCard } from "./member-progress-card";
import { ProgressSearch } from "./progress-search";

interface Props {
  nickname: string;
  address: string;
}

interface MemberImagesResponse {
  images: Record<string, string>;
}

export function ProgressOverviewContent({ nickname, address }: Props) {
  // A client-side return from a member page can already have this query in
  // React Query's cache, while the incoming server-rendered route segment
  // still starts without it. Keep the first client render deterministic and
  // expose the warm cache immediately after this component mounts.
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => {
    setClientReady(true);
  }, []);

  const overviewQuery = useProgressOverview(nickname, address);
  const data = clientReady ? overviewQuery.data : undefined;
  const error = clientReady ? overviewQuery.error : null;
  const isLoading = !clientReady || overviewQuery.isLoading;

  useEffect(() => {
    if (!data?.nickname) return;
    storeCosmoUsername(data.nickname, data.address);
  }, [data?.nickname, data?.address]);

  const imagesQuery = useQuery<MemberImagesResponse>({
    queryKey: ["progress-member-images"],
    queryFn: async () => {
      const res = await fetch("/api/progress/member-images");
      if (!res.ok) return { images: {} };
      return res.json();
    },
    staleTime: 10 * 60_000,
  });
  const imagesData = clientReady ? imagesQuery.data : undefined;
  const memberImages = imagesData?.images ?? {};

  const [filters, setFilters] = useState<ObjektFilterState>(defaultFilters);
  const [showOthers, setShowOthers] = useState(false);

  const filteredRollups = useMemo(() => {
    if (!data) return [];
    return data.rollups.filter((r) => {
      if (
        filters.artist.length &&
        !filters.artist.some((a) => normalizeArtistId(a) === r.artist)
      )
        return false;
      if (filters.member.length && !filters.member.includes(r.member))
        return false;
      if (
        filters.season.length &&
        !filters.season.some((s) => {
          const d = decodeGroupedValue(s);
          return d
            ? d.item === r.season && normalizeArtistId(d.artistId) === r.artist
            : s === r.season;
        })
      )
        return false;
      if (
        filters.class.length &&
        !filters.class.some((c) => {
          const d = decodeGroupedValue(c);
          return d
            ? d.item === r.class && normalizeArtistId(d.artistId) === r.artist
            : c === r.class;
        })
      )
        return false;
      if (
        filters.on_offline.length &&
        !filters.on_offline.includes(r.onOffline)
      )
        return false;
      return true;
    });
  }, [data, filters]);

  const activeArtists = useMemo(() => {
    if (!data) return [];
    if (filters.artist.length) return filters.artist.map(normalizeArtistId);
    return [...new Set(data.rollups.map((r) => r.artist))];
  }, [data, filters.artist]);

  // Group by artist → { real members, others }
  const artistGroups = useMemo(() => {
    if (!data)
      return new Map<
        string,
        {
          real: Map<string, ProgressRollup[]>;
          others: Map<string, ProgressRollup[]>;
        }
      >();
    return new Map(
      activeArtists.map((artist) => {
        const roster = realMembersByArtist[artist as ValidArtist] ?? [];
        const rosterSet = new Set(roster);
        const realMap = new Map<string, ProgressRollup[]>();
        const othersMap = new Map<string, ProgressRollup[]>();

        // Pre-populate roster members that have any data in the unfiltered set
        for (const member of roster) {
          if (
            data.rollups.some((r) => r.artist === artist && r.member === member)
          ) {
            realMap.set(member, []);
          }
        }

        // Assign filtered rollups
        for (const r of filteredRollups) {
          if (r.artist !== artist) continue;
          if (rosterSet.has(r.member)) {
            if (!realMap.has(r.member)) realMap.set(r.member, []);
            realMap.get(r.member)?.push(r);
          } else {
            if (!othersMap.has(r.member)) othersMap.set(r.member, []);
            othersMap.get(r.member)?.push(r);
          }
        }

        return [artist, { real: realMap, others: othersMap }] as const;
      }),
    );
  }, [data, filteredRollups, activeArtists]);

  const hasOthers = useMemo(
    () => [...artistGroups.values()].some((g) => g.others.size > 0),
    [artistGroups],
  );

  const [sharing, setSharing] = useState(false);
  const handleShare = useCallback(async () => {
    if (!data) return;
    const artist = activeArtists[0];
    if (!artist) return;
    setSharing(true);
    try {
      // Aggregate owned/total per member for the active artist.
      const memberAgg = new Map<string, { owned: number; total: number }>();
      for (const r of filteredRollups) {
        if (r.artist !== artist) continue;
        const agg = memberAgg.get(r.member) ?? { owned: 0, total: 0 };
        agg.owned += r.owned;
        agg.total += r.total;
        memberAgg.set(r.member, agg);
      }

      // Order by roster, then any remaining members.
      const roster = realMembersByArtist[artist as ValidArtist] ?? [];
      const ordered: { member: string; owned: number; total: number }[] = [];
      const seen = new Set<string>();
      for (const m of roster) {
        const agg = memberAgg.get(m);
        if (agg) {
          ordered.push({ member: m, ...agg });
          seen.add(m);
        }
      }
      for (const [m, agg] of memberAgg) {
        if (!seen.has(m)) ordered.push({ member: m, ...agg });
      }

      if (ordered.length === 0) {
        toast.error("Nothing to share for this filter.");
        return;
      }

      const owned = ordered.reduce((s, e) => s + e.owned, 0);
      const total = ordered.reduce((s, e) => s + e.total, 0);

      const canvas = await renderProgressCardToCanvas(
        {
          username: data.nickname,
          title: artist === "artms" ? "ARTMS" : artist,
          date: new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          owned,
          total,
          square: true,
          items: ordered.map((e) => ({
            thumbnailImage: memberImages[`${artist}|${e.member}`] ?? "",
            owned: true,
            caption:
              e.total > 0 ? `${Math.round((e.owned / e.total) * 100)}%` : "0%",
          })),
          verifyHandle: data.nickname,
        },
        "dark",
        Math.min(8, ordered.length),
      );
      const outcome = await shareOrDownloadCanvas(
        canvas,
        `${artist}-progress-${Date.now()}.png`,
      );
      if (outcome === "shared") toast.success("Card shared!");
      else if (outcome === "downloaded") toast.success("Card downloaded!");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to generate progress card:", err);
      toast.error(`Failed: ${msg}`);
    } finally {
      setSharing(false);
    }
  }, [data, activeArtists, filteredRollups, memberImages]);

  const showArtistLabel = activeArtists.length > 1;

  // Header and filters don't depend on the progress fetch (the title reads
  // straight off the `nickname` prop and the filter bar's options come from
  // their own always-cached hook) — render them immediately instead of
  // skeletonizing content that's already known.
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{nickname}&apos;s Collection</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={handleShare}
          disabled={sharing || (clientReady && !data)}
          className="shrink-0 gap-2"
        >
          {sharing ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <ShareIcon className="h-4 w-4" />
          )}
          Share card
        </Button>
      </div>

      <div className="max-w-xl">
        <ProgressSearch
          defaultNickname={data?.nickname ?? nickname}
          showLabel={false}
          placeholder="Search another Cosmo username"
        />
      </div>

      <ObjektFilterBar
        filters={filters}
        onChange={setFilters}
        showSearch={false}
        showSort={false}
        showFilterMode={false}
        showMember={false}
      />

      {error ? (
        <div className="text-center py-12 text-muted-foreground">
          {(error as Error & { status?: number }).status === 404
            ? "Cosmo user not found."
            : (error as Error & { status?: number }).status === 429
              ? "Too many requests. Try again later."
              : "Failed to load collection data."}
        </div>
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            <span>Loading {nickname}&apos;s collection</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }, (_, i) => `sk-${i}`).map((id) => (
              <div
                key={id}
                className="rounded-lg border border-border bg-card p-3 space-y-2"
              >
                <div className="flex gap-3">
                  <div className="h-13 w-13 bg-muted animate-pulse rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-12 bg-muted animate-pulse rounded" />
                  </div>
                </div>
                <div className="h-2 w-full bg-muted animate-pulse rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {[...artistGroups.entries()].map(([artist, { real, others }]) => (
            <div key={artist} className="space-y-3">
              {showArtistLabel && (
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {artist === "artms" ? "ARTMS" : artist}
                </h2>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {[...real.entries()].map(([member, rollups]) => (
                  <MemberProgressCard
                    key={member}
                    nickname={data.nickname}
                    member={member}
                    artist={artist}
                    rollups={rollups}
                    imageUrl={memberImages[`${artist}|${member}`]}
                  />
                ))}
              </div>
              {showOthers && others.size > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[...others.entries()].map(([member, rollups]) => (
                    <MemberProgressCard
                      key={member}
                      nickname={data.nickname}
                      member={member}
                      artist={artist}
                      rollups={rollups}
                      imageUrl={memberImages[`${artist}|${member}`]}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {hasOthers && (
            <button
              type="button"
              onClick={() => setShowOthers((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showOthers ? "Hide others" : "Show others"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
