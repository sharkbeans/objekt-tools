"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { artistLabel } from "@/lib/artist-utils";
import { membersByArtist } from "@/lib/filters";
import type {
  ProgressOverviewResponse,
  ProgressRollup,
} from "@/lib/progress/types";
import { MemberProgressCard } from "./member-progress-card";

const DEFAULT_EXCLUDED = new Set(["Welcome", "Zero"]);

interface Props {
  nickname: string;
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

  const [activeArtist, setActiveArtist] = useState<string | null>(null);
  const [excludedClasses, setExcludedClasses] = useState<Set<string>>(
    new Set(DEFAULT_EXCLUDED),
  );
  const [showUnowned, setShowUnowned] = useState(false);

  const artistsWithData = useMemo(() => {
    if (!data) return [];
    const sums = new Map<string, number>();
    for (const r of data.rollups) {
      sums.set(r.artist, (sums.get(r.artist) ?? 0) + r.owned);
    }
    return [...sums.entries()]
      .filter(([, owned]) => owned > 0)
      .map(([artist]) => artist);
  }, [data]);

  const displayArtist = useMemo(() => {
    if (activeArtist) return activeArtist;
    if (artistsWithData.length === 0 && data?.rollups.length) {
      // fallback: pick artist with highest total
      const sums = new Map<string, number>();
      for (const r of data.rollups) {
        sums.set(r.artist, (sums.get(r.artist) ?? 0) + r.total);
      }
      return [...sums.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }
    if (artistsWithData.length > 0) {
      // pick artist with highest owned sum
      const sums = new Map<string, number>();
      for (const r of data?.rollups ?? []) {
        sums.set(r.artist, (sums.get(r.artist) ?? 0) + r.owned);
      }
      return (
        [...sums.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        artistsWithData[0]
      );
    }
    return null;
  }, [activeArtist, artistsWithData, data]);

  const allClasses = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rollups.map((r) => r.class))].sort();
  }, [data]);

  const filteredRollups = useMemo(() => {
    if (!data) return [];
    return data.rollups.filter(
      (r) => r.artist === displayArtist && !excludedClasses.has(r.class),
    );
  }, [data, displayArtist, excludedClasses]);

  // Group by member, preserving roster order
  const memberRollups = useMemo(() => {
    if (!displayArtist || !data) return new Map<string, ProgressRollup[]>();
    const artistKey = Object.keys(membersByArtist).find(
      (k) =>
        k.toLowerCase() === displayArtist.toLowerCase() || k === displayArtist,
    ) as keyof typeof membersByArtist | undefined;
    const rosterOrder = artistKey ? membersByArtist[artistKey] : [];
    const map = new Map<string, ProgressRollup[]>();
    for (const member of rosterOrder) {
      const memberData = filteredRollups.filter((r) => r.member === member);
      if (
        memberData.length > 0 ||
        data.rollups.some(
          (r) => r.member === member && r.artist === displayArtist,
        )
      ) {
        map.set(
          member,
          filteredRollups.filter((r) => r.member === member),
        );
      }
    }
    // Also include members not in roster order
    for (const r of filteredRollups) {
      if (!map.has(r.member)) map.set(r.member, []);
      const arr = map.get(r.member);
      if (arr && !arr.includes(r)) arr.push(r);
    }
    return map;
  }, [filteredRollups, displayArtist, data]);

  function toggleClass(cls: string) {
    setExcludedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }, (_, i) => `sk-${i}`).map((id) => (
            <div
              key={id}
              className="rounded-lg border border-border bg-card p-3 space-y-2"
            >
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
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

  const artists = [...new Set(data.rollups.map((r) => r.artist))];
  const showTabs = artists.length > 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{data.nickname}'s Collection</h1>
      </div>

      {showTabs && (
        <div className="flex gap-2 flex-wrap">
          {artists.map((artist) => (
            <button
              key={artist}
              type="button"
              onClick={() => setActiveArtist(artist)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                displayArtist === artist
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {artistLabel(artist)}
            </button>
          ))}
        </div>
      )}

      {allClasses.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {allClasses.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => toggleClass(cls)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors border ${
                excludedClasses.has(cls)
                  ? "bg-transparent text-muted-foreground/50 border-border/50 line-through"
                  : "bg-muted text-foreground border-transparent"
              }`}
            >
              {cls}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {[...memberRollups.entries()]
          .filter(
            ([, rollups]) => showUnowned || rollups.some((r) => r.owned > 0),
          )
          .map(([member, rollups]) => (
            <MemberProgressCard
              key={member}
              nickname={data.nickname}
              member={member}
              rollups={rollups}
            />
          ))}
      </div>

      {[...memberRollups.values()].some((rollups) =>
        rollups.every((r) => r.owned === 0),
      ) && (
        <button
          type="button"
          onClick={() => setShowUnowned((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showUnowned ? "Hide unowned members" : "Show unowned members"}
        </button>
      )}
    </div>
  );
}
