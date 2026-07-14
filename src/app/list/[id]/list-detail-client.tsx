"use client";

import { DownloadIcon, Loader2Icon, PencilIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ListLinkField } from "@/components/list-link-field";
import {
  type ObjektImageItem,
  ObjektImages,
  useObjektImages,
} from "@/components/objekt/objekt-images";
import type {
  PosterData,
  PosterTheme,
} from "@/components/poster/poster-canvas";
import { MatchCard } from "@/components/trades/match-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { renderPosterToCanvas } from "@/lib/poster-canvas-render";
import { getItemQuantity, getNumberGroupKey } from "@/lib/poster-item-grouping";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";
import { sectionAbsoluteUrl, sectionHref } from "@/lib/sections";
import type { TradePostDTO } from "@/lib/trade-types";

interface StoredItem {
  id: number;
  posterId: string;
  collectionId: string | null;
  collectionNo: string | null;
  member: string | null;
  season: string | null;
  class: string | null;
  thumbnailUrl: string | null;
  serial: number | null;
  objektId: string | null;
  quantity: number;
  freeform: boolean;
  rawLabel: string | null;
  onOffline: string | null;
  position: number;
}

interface StoredPoster {
  id: string;
  userId: string | null;
  version: number;
  username: string | null;
  cosmoId: string | null;
  notes: string | null;
  haveTitle: string;
  wantTitle: string;
  theme: string;
  groupByMember: boolean;
  groupByNumbers: boolean;
  colsPerRow: number;
  createdAt: string;
  updatedAt: string;
  haves: StoredItem[];
  wants: StoredItem[];
}

function storedItemToResolved(item: StoredItem): ResolvedPosterItem {
  return {
    parsed: {
      member: item.member ?? null,
      season: item.season ?? "",
      collectionNo: item.collectionNo ?? "",
      raw:
        item.rawLabel ??
        `${item.member ?? ""} ${item.collectionNo ?? ""}`.trim(),
      ...(item.serial != null ? { serial: String(item.serial) } : {}),
      ...(item.quantity > 1 ? { quantity: item.quantity } : {}),
      ...(item.freeform ? { freeform: true as const } : {}),
      ...(item.onOffline
        ? { onOffline: item.onOffline as "online" | "offline" }
        : {}),
    },
    entry: item.collectionId
      ? {
          collectionId: item.collectionId,
          collectionNo: item.collectionNo ?? "",
          member: item.member ?? "",
          season: item.season ?? "",
          class: item.class ?? "",
          thumbnailImage: item.thumbnailUrl ?? undefined,
          artist: "",
        }
      : null,
    imageUrl: item.thumbnailUrl ?? null,
  };
}

function storedToPosterData(row: StoredPoster): PosterData {
  return {
    username: row.username ?? "",
    cosmoId: row.cosmoId ?? "",
    haves: row.haves.map(storedItemToResolved),
    wants: row.wants.map(storedItemToResolved),
    notes: row.notes ?? undefined,
    date: new Date(row.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    haveTitle: row.haveTitle,
    wantTitle: row.wantTitle,
  };
}

function totalQuantity(items: StoredItem[]) {
  return items.reduce((sum, item) => sum + Math.max(1, item.quantity ?? 1), 0);
}

function autoGridCols(count: number): number {
  if (count <= 0) return 3;
  return Math.min(7, Math.max(3, Math.ceil(Math.sqrt(count * 1.5))));
}

function storedItemToImage(
  item: StoredItem,
  quantity: number,
): ObjektImageItem {
  return {
    id: item.id,
    collectionId: item.collectionId ?? "",
    collectionNo: item.collectionNo,
    member: item.member,
    season: item.season,
    class: item.class,
    serial: item.serial,
    isAny: item.freeform,
    thumbnailUrl: item.thumbnailUrl,
    quantity: quantity > 1 ? quantity : undefined,
    customLabel: item.freeform ? (item.rawLabel ?? undefined) : undefined,
  };
}

function toImageItems(
  items: StoredItem[],
  groupByNumbers: boolean,
): ObjektImageItem[] {
  const resolved = items.map(storedItemToResolved);

  if (!groupByNumbers) {
    return items.map((item, i) =>
      storedItemToImage(item, getItemQuantity(resolved[i])),
    );
  }

  const grouped = new Map<string, { item: StoredItem; quantity: number }>();
  items.forEach((item, i) => {
    const key = getNumberGroupKey(resolved[i]);
    const qty = getItemQuantity(resolved[i]);
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += qty;
    } else {
      grouped.set(key, { item, quantity: qty });
    }
  });

  return [...grouped.values()].map(({ item, quantity }) =>
    storedItemToImage(item, quantity),
  );
}

export default function ListDetailClient({
  params,
  isOwner,
}: {
  params: Promise<{ id: string }>;
  isOwner: boolean;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [posterRow, setPosterRow] = useState<StoredPoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Anon owner check: server passes isOwner=false for anon; we check localStorage
  const [anonOwner, setAnonOwner] = useState(false);
  const [matches, setMatches] = useState<TradePostDTO[] | null>(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [checkingMatchId, setCheckingMatchId] = useState<string | null>(null);
  const [removedTradeOpen, setRemovedTradeOpen] = useState(false);

  const haveItems = useMemo(
    () =>
      toImageItems(posterRow?.haves ?? [], posterRow?.groupByNumbers ?? false),
    [posterRow],
  );
  const wantItems = useMemo(
    () =>
      toImageItems(posterRow?.wants ?? [], posterRow?.groupByNumbers ?? false),
    [posterRow],
  );
  const haveImages = useObjektImages(haveItems);
  const wantImages = useObjektImages(wantItems);
  const gridCols = Math.max(
    autoGridCols(haveItems.length),
    autoGridCols(wantItems.length),
  );
  const gridStyle = {
    gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
  };

  useEffect(() => {
    if (searchParams.get("error") === "not-owner") {
      toast.error("That's not your list.");
      router.replace(sectionHref(`/list/${id}`, { currentSection: "list" }));
    }
  }, [searchParams, id, router]);

  useEffect(() => {
    // Check anon edit token
    const token = localStorage.getItem(`poster-edit-token:${id}`);
    if (token) setAnonOwner(true);
  }, [id]);

  // Matches are only meaningful for the authenticated owner — the endpoint
  // requires a real user session (anonymous edit-token posters have no
  // linked trading account).
  useEffect(() => {
    if (!isOwner) return;
    setMatchesLoading(true);
    fetch(`/api/posters/${id}/matches`)
      .then((r) => (r.ok ? r.json() : { matches: [] }))
      .then((data) => setMatches(data.matches ?? []))
      .catch(() => setMatches([]))
      .finally(() => setMatchesLoading(false));
  }, [id, isOwner]);

  useEffect(() => {
    fetch(`/api/posters/${id}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setPosterRow(data as StoredPoster);
          // Trigger availability check after loading; server rate-limits to once per 5 min
          fetch(`/api/posters/${id}/check-availability`, { method: "POST" })
            .then((r) => r.json())
            .then((result) => {
              if (result.deleted) {
                setNotFound(true);
                setPosterRow(null);
              } else if (result.removed > 0) {
                // Re-fetch to reflect pruned haves
                fetch(`/api/posters/${id}`)
                  .then((r) => r.json())
                  .then((fresh) => {
                    if (fresh) setPosterRow(fresh as StoredPoster);
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => toast.error("Failed to load poster"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownload = useCallback(async () => {
    if (!posterRow) return;
    setDownloading(true);
    await new Promise((r) => setTimeout(r, 50));
    try {
      const data = storedToPosterData(posterRow);
      const canvas = await renderPosterToCanvas(
        data,
        (posterRow.theme as PosterTheme) ?? "dark",
        posterRow.groupByMember,
        posterRow.groupByNumbers,
        posterRow.colsPerRow,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/png",
        ),
      );
      const fileName = `trade-poster-${id}.png`;
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = fileName;
      link.href = blobUrl;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      toast.success("Poster downloaded!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed: ${msg}`);
    } finally {
      setDownloading(false);
    }
  }, [posterRow, id]);

  const handleEdit = useCallback(() => {
    router.push(sectionHref(`/list/${id}/edit`, { currentSection: "list" }));
  }, [router, id]);

  const handleOpenMatch = useCallback(
    async (match: TradePostDTO) => {
      if (checkingMatchId) return;
      setCheckingMatchId(match.id);
      try {
        const res = await fetch(`/api/trades/${match.id}/check-availability`, {
          method: "POST",
        });

        if (res.status === 404) {
          setMatches((prev) =>
            prev ? prev.filter((item) => item.id !== match.id) : prev,
          );
          setRemovedTradeOpen(true);
          return;
        }

        if (res.ok) {
          const result = await res.json();
          if (result.deleted) {
            setMatches((prev) =>
              prev ? prev.filter((item) => item.id !== match.id) : prev,
            );
            setRemovedTradeOpen(true);
            return;
          }
        }

        router.push(
          sectionHref(`/trades/${match.id}`, { currentSection: "trade" }),
        );
      } catch {
        router.push(
          sectionHref(`/trades/${match.id}`, { currentSection: "trade" }),
        );
      } finally {
        setCheckingMatchId(null);
      }
    },
    [checkingMatchId, router],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  if (notFound || !posterRow) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 py-12 text-center">
        <p className="text-lg font-medium">List not found</p>
        <p className="text-muted-foreground text-sm">
          This list may have been deleted or the link is invalid.
        </p>
        <Button asChild variant="outline">
          <Link href={sectionHref("/list", { currentSection: "list" })}>
            Make your own
          </Link>
        </Button>
      </div>
    );
  }

  const canEdit = isOwner || anonOwner;
  const haveCount = totalQuantity(posterRow.haves);
  const wantCount = totalQuantity(posterRow.wants);
  const matchCount = matches?.length ?? 0;
  const updatedLabel = new Date(posterRow.updatedAt).toLocaleDateString(
    "en-GB",
  );
  const listTitle = posterRow.username
    ? `@${posterRow.username}'s list`
    : "Trade list";
  const listToolbar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <ListLinkField
        label="List link"
        value={sectionAbsoluteUrl(`/list/${id}`)}
        className="sm:flex-1"
        hideLabel
        bare
      />

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button variant="outline" onClick={handleEdit} className="gap-1.5">
            <PencilIcon className="h-4 w-4" />
            Edit list
          </Button>
        )}

        <Button
          onClick={handleDownload}
          disabled={downloading}
          className="gap-1.5"
        >
          {downloading ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <DownloadIcon className="h-4 w-4" />
          )}
          Download PNG
        </Button>

        <Button variant="outline" asChild className="gap-1.5">
          <Link href={sectionHref("/list", { currentSection: "list" })}>
            <PlusIcon className="h-4 w-4" />
            Create another list
          </Link>
        </Button>
      </div>
    </div>
  );
  const haveWantCard = (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Trade List</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {haveCount} have · {wantCount} want · Updated {updatedLabel}
        </p>
      </div>
      {haveItems.length > 0 || wantItems.length > 0 ? (
        <div className="flex gap-6">
          {haveItems.length > 0 && (
            <ObjektImages
              items={haveItems}
              images={haveImages}
              label={posterRow.haveTitle}
              showSerial={!posterRow.groupByNumbers}
              cosmoNickname={posterRow.cosmoId}
              gridStyle={gridStyle}
            />
          )}
          {haveItems.length > 0 && wantItems.length > 0 && (
            <Separator orientation="vertical" className="h-auto" />
          )}
          {wantItems.length > 0 && (
            <ObjektImages
              items={wantItems}
              images={wantImages}
              label={posterRow.wantTitle}
              isWant
              gridStyle={gridStyle}
            />
          )}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          This list is empty.
        </p>
      )}
      {posterRow.notes && (
        <>
          <Separator className="my-4" />
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {posterRow.notes}
          </p>
        </>
      )}
    </div>
  );

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold sm:text-3xl">
              {listTitle}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {haveCount} have · {wantCount} want · Updated {updatedLabel}
            </p>
          </div>
        </header>

        <div className="space-y-4">
          {listToolbar}
          {haveWantCard}
        </div>

        {anonOwner && (
          <p className="text-center text-xs text-muted-foreground">
            You can edit this list because you created it. Clearing your browser
            data will remove edit access.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              List Workspace
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold sm:text-3xl">
              {listTitle}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-border bg-card px-3 py-1.5 text-foreground">
              {matchCount} {matchCount === 1 ? "match" : "matches"}
            </span>
            <span className="rounded-full border border-border bg-card px-3 py-1.5 text-muted-foreground">
              {haveCount} have
            </span>
            <span className="rounded-full border border-border bg-card px-3 py-1.5 text-muted-foreground">
              {wantCount} want
            </span>
          </div>
        </div>
      </header>

      <div className="space-y-6">
        {listToolbar}
        {haveWantCard}

        <div className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-xl font-bold">
              Matches
              {matches && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({matches.length} found)
                </span>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              Trade posts that have something you need and want something you
              can offer.
            </p>
          </div>

          {matchesLoading ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Finding matches...
              </CardContent>
            </Card>
          ) : matches && matches.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onOpenTrade={handleOpenMatch}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No matches yet. Check back later, or reach out on Discord.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {anonOwner && (
        <p className="text-center text-xs text-muted-foreground">
          You can edit this list because you created it. Clearing your browser
          data will remove edit access.
        </p>
      )}

      <AlertDialog open={removedTradeOpen} onOpenChange={setRemovedTradeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trade unavailable</AlertDialogTitle>
            <AlertDialogDescription>
              This trade was removed because the offered objekts are no longer
              in the trader&apos;s inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
