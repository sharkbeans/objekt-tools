"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  LayoutGridIcon,
  Loader2Icon,
  ShareIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  const [activeClasses, setActiveClasses] = useState<string[]>([]);
  const [activeSeasons, setActiveSeasons] = useState<string[]>([]);
  const [seasonInitialized, setSeasonInitialized] = useState(false);
  const [unownedOnly, setUnownedOnly] = useState(false);
  const [ownedOnly, setOwnedOnly] = useState(false);
  // Objekts per row: 5 on desktop, 2 on mobile (set after mount to avoid a
  // hydration mismatch). User can override via the dropdown.
  const [perRow, setPerRow] = useState(5);
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setPerRow(2);
  }, []);

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

  // Default to the latest (current) season once data loads. allSeasons is in
  // ascending season order, so the last entry is the most recent.
  useEffect(() => {
    if (seasonInitialized || allSeasons.length === 0) return;
    setActiveSeasons([allSeasons[allSeasons.length - 1]]);
    setSeasonInitialized(true);
  }, [allSeasons, seasonInitialized]);

  // Base filter: class + season only (used for accurate totals). Empty arrays
  // mean "all".
  const baseFiltered = useMemo(() => {
    if (!data) return [];
    return data.collections.filter(
      (c) =>
        (activeClasses.length === 0 || activeClasses.includes(c.class)) &&
        (activeSeasons.length === 0 || activeSeasons.includes(c.season)),
    );
  }, [data, activeClasses, activeSeasons]);

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Above this many cards the share image gets large/slow — warn first.
  const SHARE_WARN_THRESHOLD = 100;

  const doShare = useCallback(async () => {
    if (!data) return;
    // Share the exact set on screen so the card follows every active filter
    // (season, class, owned/unowned only).
    const shareCols = filtered;
    if (shareCols.length === 0) {
      toast.error("Nothing to share for this filter.");
      return;
    }
    setSharing(true);
    const toastId = `progress-card-${data.member}-${Date.now()}`;
    toast.loading(`Generating ${data.member} card…`, {
      id: toastId,
      description: "Loading objekts — you can keep browsing while this runs.",
    });
    try {
      const owned = shareCols.filter((c) => c.ownedCount > 0).length;
      const total = shareCols.length;

      // Subtitle carries the active artist + season (+ class) filter context.
      const artistLabel = data.artist === "artms" ? "ARTMS" : data.artist;
      const ownershipLabel = unownedOnly
        ? "Missing"
        : ownedOnly
          ? "Owned"
          : null;
      const seasonLabel =
        activeSeasons.length === 0 ? "All seasons" : activeSeasons.join(", ");
      const classLabel =
        activeClasses.length === 0 ? null : activeClasses.join(", ");
      const subtitle = [artistLabel, seasonLabel, classLabel, ownershipLabel]
        .filter(Boolean)
        .join("  ·  ");

      const canvas = await renderProgressCardToCanvas(
        {
          username: data.nickname,
          title: data.member,
          subtitle,
          date: new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          owned,
          total,
          items: shareCols.map((c) => ({
            thumbnailImage: c.thumbnailImage,
            owned: c.ownedCount > 0,
          })),
          verifyHandle: data.nickname,
          strictImages: true,
          onProgress: (done, total) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            toast.loading(`Generating ${data.member} card… ${pct}%`, {
              id: toastId,
              description: `Loaded ${done}/${total} objekts — you can keep browsing.`,
            });
          },
        },
        "dark",
      );
      toast.loading("Finishing card…", {
        id: toastId,
        description: "Almost there.",
      });
      const outcome = await shareOrDownloadCanvas(
        canvas,
        `${data.member}-progress-${Date.now()}.png`,
      );
      if (outcome === "shared")
        toast.success("Card shared!", { id: toastId, description: undefined });
      else if (outcome === "downloaded")
        toast.success("Card downloaded!", {
          id: toastId,
          description: undefined,
        });
      else toast.dismiss(toastId);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        toast.dismiss(toastId);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to generate progress card:", err);
      toast.error("Couldn't generate card", { id: toastId, description: msg });
    } finally {
      setSharing(false);
    }
  }, [data, filtered, activeSeasons, activeClasses, unownedOnly, ownedOnly]);

  const handleShare = useCallback(() => {
    if (filtered.length > SHARE_WARN_THRESHOLD) {
      setConfirmOpen(true);
      return;
    }
    void doShare();
  }, [filtered.length, doShare]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-48 bg-muted animate-pulse rounded" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          <span>Loading {member}&apos;s objekts</span>
        </div>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: perRow * 4 }, (_, i) => `sk-${i}`).map((id) => (
            <div
              key={id}
              className="aspect-63/88 rounded bg-muted animate-pulse"
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
            onClick={() => setActiveSeasons([])}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
              activeSeasons.length === 0
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            All
          </button>
          {allSeasons.map((s) => {
            const color = seasonColors[`${data.artist}|${s}`] ?? null;
            const isActive = activeSeasons.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() =>
                  setActiveSeasons((prev) =>
                    prev.includes(s)
                      ? prev.filter((x) => x !== s)
                      : [...prev, s],
                  )
                }
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
            onClick={() => setActiveClasses([])}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
              activeClasses.length === 0
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
              onClick={() =>
                setActiveClasses((prev) =>
                  prev.includes(cls)
                    ? prev.filter((x) => x !== cls)
                    : [...prev, cls],
                )
              }
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                activeClasses.includes(cls)
                  ? "bg-muted text-foreground border-transparent"
                  : "bg-transparent text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {cls}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto gap-1.5">
              <LayoutGridIcon className="h-4 w-4" />
              {perRow} / row
              <ChevronDownIcon className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={String(perRow)}
              onValueChange={(v) => setPerRow(Number(v))}
            >
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <DropdownMenuRadioItem key={n} value={String(n)}>
                  {n} per row
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-8">
        {[...grouped.entries()].map(([season, cols]) => (
          <SeasonSection
            key={season}
            season={season}
            collections={cols}
            perRow={perRow}
            address={data.address}
          />
        ))}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate a large card?</AlertDialogTitle>
            <AlertDialogDescription>
              This will render {filtered.length} objekts into one image. It may
              take a while and produce a large file. You can narrow the filters
              (season, class, owned/unowned) to make it smaller.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doShare()}>
              Generate anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
