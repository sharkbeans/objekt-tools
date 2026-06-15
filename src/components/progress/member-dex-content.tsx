"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, ShareIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { shareOrDownloadCanvas } from "@/lib/download-canvas";
import { renderProgressCardToCanvas } from "@/lib/progress/progress-card-render";
import type { ProgressMemberResponse } from "@/lib/progress/types";
import { SeasonSection } from "./season-section";

interface SeasonColorsResponse {
  colors: Record<string, string>;
}

interface Props {
  nickname: string;
  member: string;
}

export function MemberDexContent({ nickname, member }: Props) {
  const { data, isLoading, error } = useQuery<ProgressMemberResponse>({
    queryKey: ["progress", nickname, member],
    queryFn: async () => {
      const res = await fetch(
        `/api/progress/${encodeURIComponent(nickname)}/${encodeURIComponent(member)}`,
      );
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

  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState<string | null>(null);
  const [unownedOnly, setUnownedOnly] = useState(false);
  const [ownedOnly, setOwnedOnly] = useState(false);

  const { data: seasonColorsData } = useQuery<SeasonColorsResponse>({
    queryKey: ["progress-season-colors"],
    queryFn: async () => {
      const res = await fetch("/api/progress/season-colors");
      if (!res.ok) return { colors: {} };
      return res.json();
    },
    staleTime: 10 * 60_000,
  });
  const seasonColors = seasonColorsData?.colors ?? {};

  const allSeasons = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of data.collections) {
      if (!seen.has(c.season)) {
        seen.add(c.season);
        out.push(c.season);
      }
    }
    return out;
  }, [data]);

  const allClasses = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.collections.map((c) => c.class))].sort();
  }, [data]);

  // Base filter: class + season only (used for accurate totals)
  const baseFiltered = useMemo(() => {
    if (!data) return [];
    return data.collections.filter(
      (c) =>
        (activeClass === null || c.class === activeClass) &&
        (activeSeason === null || c.season === activeSeason),
    );
  }, [data, activeClass, activeSeason]);

  // Full filter including ownership toggles (used for display)
  const filtered = useMemo(
    () =>
      baseFiltered.filter(
        (c) =>
          (!unownedOnly || c.ownedCount === 0) &&
          (!ownedOnly || c.ownedCount > 0),
      ),
    [baseFiltered, unownedOnly, ownedOnly],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const c of filtered) {
      const arr = map.get(c.season) ?? [];
      arr.push(c);
      map.set(c.season, arr);
    }
    return map;
  }, [filtered]);

  // Totals from base (not affected by ownership toggles)
  const totals = useMemo(() => {
    const owned = baseFiltered.filter((c) => c.ownedCount > 0).length;
    return { owned, total: baseFiltered.length };
  }, [baseFiltered]);

  const [sharing, setSharing] = useState(false);
  const handleShare = useCallback(async () => {
    if (!data) return;
    setSharing(true);
    try {
      // Rarest owned / still-hunting from the current (class+season) view.
      const withSupply = baseFiltered.filter((c) => c.supply != null);
      const bySupply = (a: { supply?: number }, b: { supply?: number }) =>
        (a.supply ?? Infinity) - (b.supply ?? Infinity);
      const rarestOwned = withSupply
        .filter((c) => c.ownedCount > 0)
        .sort(bySupply)[0];
      const rarestMissing = withSupply
        .filter((c) => c.ownedCount === 0)
        .sort(bySupply)[0];

      const canvas = await renderProgressCardToCanvas(
        {
          username: data.nickname,
          title: data.member,
          subtitle: data.artist === "artms" ? "ARTMS" : data.artist,
          date: new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          owned: totals.owned,
          total: totals.total,
          items: baseFiltered.map((c) => ({
            thumbnailImage: c.thumbnailImage,
            owned: c.ownedCount > 0,
            scarcityTier: c.scarcityTier,
          })),
          verifyHandle: data.nickname,
          highlights: {
            rarestOwned: rarestOwned?.collectionNo,
            rarestMissing: rarestMissing?.collectionNo,
          },
        },
        "dark",
      );
      const outcome = await shareOrDownloadCanvas(
        canvas,
        `${data.member}-progress-${Date.now()}.png`,
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
  }, [data, baseFiltered, totals]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {Array.from({ length: 15 }, (_, i) => `sk-${i}`).map((id) => (
            <div
              key={id}
              className="aspect-[63/88] rounded bg-muted animate-pulse"
            />
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
          ? "Member or user not found."
          : status === 429
            ? "Too many requests. Try again later."
            : "Failed to load collection data."}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{data.member}</h1>
          <p className="text-sm text-muted-foreground">
            {totals.owned}/{totals.total} collected
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleShare}
          disabled={sharing || totals.total === 0}
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

      {allSeasons.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveSeason(null)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
              activeSeason === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            All
          </button>
          {allSeasons.map((s) => {
            const color = seasonColors[`${data.artist}|${s}`] ?? null;
            const isActive = activeSeason === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSeason(s)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                  isActive
                    ? "text-white"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
                style={
                  color
                    ? isActive
                      ? { backgroundColor: color, borderColor: color }
                      : { borderColor: color }
                    : isActive
                      ? undefined
                      : { borderColor: "hsl(var(--border))" }
                }
              >
                {s}
              </button>
            );
          })}
        </div>
      )}

      {allClasses.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveClass(null)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
              activeClass === null
                ? "bg-muted text-foreground border-transparent"
                : "bg-transparent text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            All
          </button>
          {allClasses.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => setActiveClass(cls)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                activeClass === cls
                  ? "bg-muted text-foreground border-transparent"
                  : "bg-transparent text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {cls}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Unowned only</span>
          <Switch
            checked={unownedOnly}
            onCheckedChange={(v) => {
              setUnownedOnly(v);
              if (v) setOwnedOnly(false);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Owned only</span>
          <Switch
            checked={ownedOnly}
            onCheckedChange={(v) => {
              setOwnedOnly(v);
              if (v) setUnownedOnly(false);
            }}
          />
        </div>
      </div>

      <div className="space-y-8">
        {[...grouped.entries()].map(([season, cols]) => (
          <SeasonSection key={season} season={season} collections={cols} />
        ))}
      </div>
    </div>
  );
}
