"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  defaultFilters,
  type TradeFilterState,
  TradeFilters,
} from "@/components/trades/trade-filters";
import { decodeGroupedValue } from "@/components/ui/class-multi-select";
import { normalizeArtistId } from "@/lib/artist-utils";
import { realMembersByArtist, type ValidArtist } from "@/lib/filters";
import type {
  ProgressOverviewResponse,
  ProgressRollup,
} from "@/lib/progress/types";
import { MemberProgressCard } from "./member-progress-card";

interface Props {
  nickname: string;
}

interface MemberImagesResponse {
  images: Record<string, string>;
}

export function ProgressOverviewContent({ nickname }: Props) {
  const { data, isLoading, error } = useQuery<ProgressOverviewResponse>({
    queryKey: ["progress", nickname],
    queryFn: async () => {
      const res = await fetch(`/api/progress/${encodeURIComponent(nickname)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error ?? "Failed to load"), {
          status: res.status,
        });
      }
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });

  const { data: imagesData } = useQuery<MemberImagesResponse>({
    queryKey: ["progress-member-images"],
    queryFn: async () => {
      const res = await fetch("/api/progress/member-images");
      if (!res.ok) return { images: {} };
      return res.json();
    },
    staleTime: 10 * 60_000,
  });
  const memberImages = imagesData?.images ?? {};

  const [filters, setFilters] = useState<TradeFilterState>(defaultFilters);
  const [initialized, setInitialized] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  // Default the artist filter to whichever has the most owned items
  useEffect(() => {
    if (!data || initialized) return;
    const ownedSums = new Map<string, number>();
    const totalSums = new Map<string, number>();
    for (const r of data.rollups) {
      ownedSums.set(r.artist, (ownedSums.get(r.artist) ?? 0) + r.owned);
      totalSums.set(r.artist, (totalSums.get(r.artist) ?? 0) + r.total);
    }
    const sorted = [...ownedSums.entries()].sort((a, b) => b[1] - a[1]);
    const best =
      (sorted[0]?.[1] ?? 0) > 0
        ? sorted[0][0]
        : ([...totalSums.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
          null);
    if (best) setFilters((f) => ({ ...f, artist: [best] }));
    setInitialized(true);
  }, [data, initialized]);

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
            realMap.get(r.member)!.push(r);
          } else {
            if (!othersMap.has(r.member)) othersMap.set(r.member, []);
            othersMap.get(r.member)!.push(r);
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

  if (isLoading || !initialized) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 8 }, (_, i) => `sk-${i}`).map((id) => (
            <div
              key={id}
              className="rounded-lg border border-border bg-card p-3 space-y-2"
            >
              <div className="flex gap-3">
                <div className="h-12 w-8 bg-muted animate-pulse rounded" />
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
    );
  }

  if (error) {
    const status = (error as Error & { status?: number }).status;
    return (
      <div className="text-center py-12 text-muted-foreground">
        {status === 404
          ? "Cosmo user not found."
          : status === 429
            ? "Too many requests. Try again later."
            : "Failed to load collection data."}
      </div>
    );
  }

  if (!data) return null;

  const showArtistLabel = activeArtists.length > 1;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{data.nickname}&apos;s Collection</h1>

      <TradeFilters
        filters={filters}
        onChange={setFilters}
        showSearch={false}
        showSort={false}
        showFilterMode={false}
      />

      {[...artistGroups.entries()].map(([artist, { real, others }]) => (
        <div key={artist} className="space-y-3">
          {showArtistLabel && (
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {artist === "artms" ? "ARTMS" : artist}
            </h2>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...real.entries()].map(([member, rollups]) => (
              <MemberProgressCard
                key={member}
                nickname={data.nickname}
                member={member}
                rollups={rollups}
                imageUrl={memberImages[`${artist}|${member}`]}
              />
            ))}
          </div>
          {showOthers && others.size > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[...others.entries()].map(([member, rollups]) => (
                <MemberProgressCard
                  key={member}
                  nickname={data.nickname}
                  member={member}
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
    </div>
  );
}
