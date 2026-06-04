"use client";

import { DownloadIcon, Loader2Icon, PencilIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  PosterCanvas,
  type PosterData,
  type PosterTheme,
} from "@/components/poster/poster-canvas";
import { ListLinkField } from "@/components/list-link-field";
import { Button } from "@/components/ui/button";
import { renderPosterToCanvas } from "@/lib/poster-canvas-render";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";

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
  const [origin, setOrigin] = useState("");
  // Anon owner check: server passes isOwner=false for anon; we check localStorage
  const [anonOwner, setAnonOwner] = useState(false);

  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchParams.get("error") === "not-owner") {
      toast.error("That's not your list.");
      router.replace(`/list/${id}`);
    }
  }, [searchParams, id, router]);

  useEffect(() => {
    setOrigin(window.location.origin);
    // Check anon edit token
    const token = localStorage.getItem(`poster-edit-token:${id}`);
    if (token) setAnonOwner(true);
  }, [id]);

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
                  .then((fresh) => { if (fresh) setPosterRow(fresh as StoredPoster); })
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
    router.push(`/list/${id}/edit`);
  }, [router, id]);

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
          <Link href="/list">Make your own</Link>
        </Button>
      </div>
    );
  }

  const posterData = storedToPosterData(posterRow);
  const canEdit = isOwner || anonOwner;

  return (
    <div className="max-w-4xl sm:mx-auto space-y-4">
      <div className="space-y-3">
        {/* Controls bar */}
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">
            {posterRow.username
              ? `@${posterRow.username}'s list`
              : "Trade list"}
          </h1>
        </div>
      </div>

      {/* Poster (read-only) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        {origin && (
          <ListLinkField
            label="List link"
            value={`${origin}/list/${id}`}
            className="sm:max-w-sm"
          />
        )}

        <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:flex-wrap sm:justify-end">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEdit}
              className="gap-1.5"
            >
              <PencilIcon className="h-4 w-4" />
              Edit
            </Button>
          )}

          <Button
            size="sm"
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

          <Button
            size="sm"
            asChild
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Link href="/list">
              <PlusIcon className="h-4 w-4" />
              Create List
            </Link>
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <PosterCanvas
          ref={posterRef}
          data={posterData}
          theme={(posterRow.theme as PosterTheme) ?? "dark"}
          editable={false}
          groupByMember={posterRow.groupByMember}
          groupByNumbers={posterRow.groupByNumbers}
          colsPerRow={posterRow.colsPerRow}
        />
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
