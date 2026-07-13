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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shareOrDownloadCanvas } from "@/lib/download-canvas";
import {
  EDITION_LABELS,
  type Edition,
  getCollectionEdition,
} from "@/lib/edition";
import { renderProgressCardToCanvas } from "@/lib/progress/progress-card-render";
import type {
  ProgressCollection,
  ProgressMemberResponse,
} from "@/lib/progress/types";
import { GridSection } from "./grid-section";
import { SeasonSection } from "./season-section";

interface SeasonColorsResponse {
  colors: Record<string, string>;
}

interface StoredSelection {
  activeTab?: "dex" | "grid";
  dexActiveClasses?: string[];
  dexActiveSeasons?: string[];
  dexActiveEditions?: Edition[];
  unownedOnly?: boolean;
  ownedOnly?: boolean;
  perRow?: number;
  gridActiveSeasons?: string[];
  gridActiveEditions?: Edition[];
  viewConsumed?: boolean;
}

function selectionStorageKey(nickname: string, member: string): string {
  return `collection-selection:${nickname.toLowerCase()}:${member.toLowerCase()}`;
}

function chipClass(active: boolean): string {
  return `px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
    active
      ? "bg-muted text-foreground border-transparent"
      : "bg-transparent text-muted-foreground border-border hover:text-foreground"
  }`;
}

function EditionChipRow({
  active,
  onToggle,
  onClear,
}: {
  active: Edition[];
  onToggle: (edition: Edition) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={onClear}
        className={chipClass(active.length === 0)}
      >
        All editions
      </button>
      {([1, 2, 3] as const).map((ed) => (
        <button
          key={ed}
          type="button"
          onClick={() => onToggle(ed)}
          className={chipClass(active.includes(ed))}
        >
          {EDITION_LABELS[ed]}
        </button>
      ))}
    </div>
  );
}

function SeasonChipRow({
  seasons,
  active,
  artist,
  seasonColors,
  onToggle,
  onClear,
}: {
  seasons: string[];
  active: string[];
  artist: string;
  seasonColors: Record<string, string>;
  onToggle: (season: string) => void;
  onClear: () => void;
}) {
  if (seasons.length <= 1) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={onClear}
        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
          active.length === 0
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-transparent text-muted-foreground border-border hover:text-foreground"
        }`}
      >
        All
      </button>
      {seasons.map((s) => {
        const color = seasonColors[`${artist}|${s}`] ?? null;
        const isActive = active.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onToggle(s)}
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
  );
}

function toggleValue<T>(prev: T[], value: T): T[] {
  return prev.includes(value)
    ? prev.filter((x) => x !== value)
    : [...prev, value];
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

  const [activeTab, setActiveTab] = useState<"dex" | "grid">("dex");

  // Dex-scoped filters
  const [dexActiveClasses, setDexActiveClasses] = useState<string[]>([]);
  const [dexActiveSeasons, setDexActiveSeasons] = useState<string[]>([]);
  const [dexActiveEditions, setDexActiveEditions] = useState<Edition[]>([]);
  const [dexSeasonInitialized, setDexSeasonInitialized] = useState(false);
  const [unownedOnly, setUnownedOnly] = useState(false);
  const [ownedOnly, setOwnedOnly] = useState(false);
  // Objekts per row: 5 on desktop, 2 on mobile (set after mount to avoid a
  // hydration mismatch). User can override via the dropdown.
  const [perRow, setPerRow] = useState(5);
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setPerRow(2);
  }, []);

  // Grid-scoped filters — independent from Dex's. A grid board is always
  // First+Special, so there's no class dimension here.
  const [gridActiveSeasons, setGridActiveSeasons] = useState<string[]>([]);
  const [gridActiveEditions, setGridActiveEditions] = useState<Edition[]>([]);
  const [gridSeasonInitialized, setGridSeasonInitialized] = useState(false);
  const [viewConsumed, setViewConsumed] = useState(true);

  // Restore this page's last-used tab/filters from localStorage (client
  // only — runs after mount to avoid a hydration mismatch). Keyed per
  // nickname+member so switching pages doesn't leak unrelated selections.
  const [selectionRestored, setSelectionRestored] = useState(false);
  useEffect(() => {
    setSelectionRestored(false);
    try {
      const raw = localStorage.getItem(selectionStorageKey(nickname, member));
      if (raw) {
        const stored = JSON.parse(raw) as StoredSelection;
        if (stored.activeTab) setActiveTab(stored.activeTab);
        if (stored.dexActiveClasses)
          setDexActiveClasses(stored.dexActiveClasses);
        if (stored.dexActiveSeasons) {
          setDexActiveSeasons(stored.dexActiveSeasons);
          setDexSeasonInitialized(true);
        }
        if (stored.dexActiveEditions)
          setDexActiveEditions(stored.dexActiveEditions);
        if (stored.unownedOnly != null) setUnownedOnly(stored.unownedOnly);
        if (stored.ownedOnly != null) setOwnedOnly(stored.ownedOnly);
        if (stored.perRow != null) setPerRow(stored.perRow);
        if (stored.gridActiveSeasons) {
          setGridActiveSeasons(stored.gridActiveSeasons);
          setGridSeasonInitialized(true);
        }
        if (stored.gridActiveEditions)
          setGridActiveEditions(stored.gridActiveEditions);
        if (stored.viewConsumed != null) setViewConsumed(stored.viewConsumed);
      }
    } catch {
      // Malformed/unavailable storage — fall back to defaults.
    }
    setSelectionRestored(true);
  }, [nickname, member]);

  // Persist the current selection whenever it changes, once the initial
  // restore above has run (so we don't clobber storage with defaults first).
  useEffect(() => {
    if (!selectionRestored) return;
    const selection: StoredSelection = {
      activeTab,
      dexActiveClasses,
      dexActiveSeasons,
      dexActiveEditions,
      unownedOnly,
      ownedOnly,
      perRow,
      gridActiveSeasons,
      gridActiveEditions,
      viewConsumed,
    };
    localStorage.setItem(
      selectionStorageKey(nickname, member),
      JSON.stringify(selection),
    );
  }, [
    selectionRestored,
    nickname,
    member,
    activeTab,
    dexActiveClasses,
    dexActiveSeasons,
    dexActiveEditions,
    unownedOnly,
    ownedOnly,
    perRow,
    gridActiveSeasons,
    gridActiveEditions,
    viewConsumed,
  ]);

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

  const editionByCollectionId = useMemo(() => {
    const map = new Map<string, Edition>();
    if (!data) return map;
    for (const c of data.collections) {
      const edition = getCollectionEdition({
        artist: c.artist,
        class: c.class,
        onOffline: c.onOffline,
        collectionNo: c.collectionNo,
        season: c.season,
      });
      if (edition) map.set(c.collectionId, edition);
    }
    return map;
  }, [data]);

  const hasEditions = editionByCollectionId.size > 0;

  // Seasons that actually have grid-eligible (edition-bearing) collections —
  // a season with only idntt-style non-editioned classes shouldn't show up
  // as a Grid season chip even if it's a valid Dex season.
  const gridAllSeasons = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of data.collections) {
      if (editionByCollectionId.has(c.collectionId) && !seen.has(c.season)) {
        seen.add(c.season);
        out.push(c.season);
      }
    }
    return out;
  }, [data, editionByCollectionId]);

  // Default each section to the latest (current) season once data loads.
  // allSeasons/gridAllSeasons are in ascending order, so the last entry is
  // the most recent.
  useEffect(() => {
    if (dexSeasonInitialized || allSeasons.length === 0) return;
    setDexActiveSeasons([allSeasons[allSeasons.length - 1]]);
    setDexSeasonInitialized(true);
  }, [allSeasons, dexSeasonInitialized]);

  useEffect(() => {
    if (gridSeasonInitialized || gridAllSeasons.length === 0) return;
    setGridActiveSeasons([gridAllSeasons[gridAllSeasons.length - 1]]);
    setGridSeasonInitialized(true);
  }, [gridAllSeasons, gridSeasonInitialized]);

  // Base filter: class + season + edition (used for accurate totals). Empty
  // arrays mean "all".
  const baseFiltered = useMemo(() => {
    if (!data) return [];
    return data.collections.filter(
      (c) =>
        (dexActiveClasses.length === 0 || dexActiveClasses.includes(c.class)) &&
        (dexActiveSeasons.length === 0 ||
          dexActiveSeasons.includes(c.season)) &&
        (dexActiveEditions.length === 0 ||
          dexActiveEditions.includes(
            editionByCollectionId.get(c.collectionId) as Edition,
          )),
    );
  }, [
    data,
    dexActiveClasses,
    dexActiveSeasons,
    dexActiveEditions,
    editionByCollectionId,
  ]);

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

  // Grid tab has its own season+edition scope, independent of Dex's.
  const gridGrouped = useMemo(() => {
    if (!data) return new Map<string, ProgressCollection[]>();
    const bySeasonEdition = data.collections.filter(
      (c) =>
        (gridActiveSeasons.length === 0 ||
          gridActiveSeasons.includes(c.season)) &&
        (gridActiveEditions.length === 0 ||
          gridActiveEditions.includes(
            editionByCollectionId.get(c.collectionId) as Edition,
          )),
    );
    const map = new Map<string, ProgressCollection[]>();
    for (const c of bySeasonEdition) {
      const arr = map.get(c.season) ?? [];
      arr.push(c);
      map.set(c.season, arr);
    }
    return map;
  }, [data, gridActiveSeasons, gridActiveEditions, editionByCollectionId]);

  // Header totals are always the member's full, unfiltered collection — they
  // shouldn't shift depending on which tab or filters are active.
  const totals = useMemo(() => {
    if (!data) return { owned: 0, total: 0 };
    const owned = data.collections.filter((c) => c.ownedCount > 0).length;
    return { owned, total: data.collections.length };
  }, [data]);

  const [sharing, setSharing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Above this many cards the share image gets large/slow — warn first.
  const SHARE_WARN_THRESHOLD = 100;

  const doShare = useCallback(async () => {
    if (!data) return;
    // Share the exact set on screen so the card follows every active Dex
    // filter (season, class, owned/unowned only).
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
        dexActiveSeasons.length === 0
          ? "All seasons"
          : dexActiveSeasons.join(", ");
      const classLabel =
        dexActiveClasses.length === 0 ? null : dexActiveClasses.join(", ");
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
  }, [
    data,
    filtered,
    dexActiveSeasons,
    dexActiveClasses,
    unownedOnly,
    ownedOnly,
  ]);

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

  const dexContent = (
    <div className="space-y-4">
      <SeasonChipRow
        seasons={allSeasons}
        active={dexActiveSeasons}
        artist={data.artist}
        seasonColors={seasonColors}
        onToggle={(s) => setDexActiveSeasons((prev) => toggleValue(prev, s))}
        onClear={() => setDexActiveSeasons([])}
      />

      {allClasses.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setDexActiveClasses([])}
            className={chipClass(dexActiveClasses.length === 0)}
          >
            All
          </button>
          {allClasses.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() =>
                setDexActiveClasses((prev) => toggleValue(prev, cls))
              }
              className={chipClass(dexActiveClasses.includes(cls))}
            >
              {cls}
            </button>
          ))}
        </div>
      )}

      {hasEditions && (
        <EditionChipRow
          active={dexActiveEditions}
          onToggle={(ed) =>
            setDexActiveEditions((prev) => toggleValue(prev, ed))
          }
          onClear={() => setDexActiveEditions([])}
        />
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
            <Button variant="outline" size="sm" className="gap-1.5">
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
        <Button
          size="sm"
          variant="outline"
          onClick={handleShare}
          disabled={sharing || totals.total === 0}
          className="ml-auto gap-2"
        >
          {sharing ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <ShareIcon className="h-4 w-4" />
          )}
          Share card
        </Button>
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
    </div>
  );

  const gridContent = (
    <div className="space-y-4">
      <SeasonChipRow
        seasons={gridAllSeasons}
        active={gridActiveSeasons}
        artist={data.artist}
        seasonColors={seasonColors}
        onToggle={(s) => setGridActiveSeasons((prev) => toggleValue(prev, s))}
        onClear={() => setGridActiveSeasons([])}
      />

      <EditionChipRow
        active={gridActiveEditions}
        onToggle={(ed) =>
          setGridActiveEditions((prev) => toggleValue(prev, ed))
        }
        onClear={() => setGridActiveEditions([])}
      />

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">View Consumed</span>
          <Switch checked={viewConsumed} onCheckedChange={setViewConsumed} />
        </div>
      </div>

      <div className="space-y-8">
        {[...gridGrouped.entries()].map(([season, cols]) => (
          <GridSection
            key={season}
            season={season}
            collections={cols}
            address={data.address}
            nickname={data.nickname}
            viewConsumed={viewConsumed}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{data.member}</h1>
        <p className="text-muted-foreground">
          {totals.owned}/{totals.total} collected
        </p>
      </div>

      {hasEditions ? (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "dex" | "grid")}
        >
          <TabsList>
            <TabsTrigger value="grid">Grid</TabsTrigger>
            <TabsTrigger value="dex">Collection</TabsTrigger>
          </TabsList>

          <TabsContent value="dex" className="pt-4">
            {dexContent}
          </TabsContent>
          <TabsContent value="grid" className="pt-4">
            {gridContent}
          </TabsContent>
        </Tabs>
      ) : (
        dexContent
      )}

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
