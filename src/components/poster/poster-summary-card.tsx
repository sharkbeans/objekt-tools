"use client";

import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatSeasonNumberLabel, formatShortLabel } from "@/lib/objekt-label";
import { sectionAbsoluteUrl, sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

export interface PosterSummary {
  id: string;
  username: string | null;
  notes: string | null;
  theme: string;
  createdAt: string;
  updatedAt: string;
  haves: {
    id: number;
    thumbnailUrl: string | null;
    quantity: number;
    member: string | null;
    season: string | null;
    collectionNo: string | null;
    collectionId: string;
  }[];
  wants: {
    id: number;
    thumbnailUrl: string | null;
    quantity: number;
    member: string | null;
    season: string | null;
    collectionNo: string | null;
    collectionId: string;
  }[];
}

const PREVIEW_VISIBLE_COUNT = 4;

function itemQuantity(item: { quantity?: number | null }) {
  return Math.max(1, item.quantity ?? 1);
}

function totalQuantity(items: { quantity?: number | null }[]) {
  return items.reduce((sum, item) => sum + itemQuantity(item), 0);
}

function buildPreviewSide(
  items: {
    id: number;
    thumbnailUrl: string | null;
    quantity: number;
    member: string | null;
    season: string | null;
    collectionNo: string | null;
    collectionId: string;
  }[],
) {
  const seen = new Set<string>();
  const entries: typeof items = [];
  const total = totalQuantity(items);

  for (const item of items) {
    if (!item.thumbnailUrl || seen.has(item.thumbnailUrl)) continue;
    seen.add(item.thumbnailUrl);
    entries.push(item);
    if (entries.length >= PREVIEW_VISIBLE_COUNT) break;
  }

  return {
    entries,
    remaining: Math.max(total - entries.length, 0),
  };
}

function ObjektThumb({
  item,
}: {
  item: {
    thumbnailUrl: string | null;
    member: string | null;
    season: string | null;
    collectionNo: string | null;
    collectionId: string;
  };
}) {
  if (!item.thumbnailUrl) return null;

  const shortLabel = formatSeasonNumberLabel(item);
  const fullLabel = formatShortLabel(item);

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <div className="h-[4.75rem] w-14 overflow-hidden rounded border border-border bg-muted">
        <Image
          src={item.thumbnailUrl}
          alt=""
          width={56}
          height={76}
          className="h-full w-full object-cover"
          unoptimized
        />
      </div>
      <p
        className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground"
        title={fullLabel}
      >
        {shortLabel}
      </p>
    </div>
  );
}

function MoreObjektsTile({ count }: { count: number }) {
  return (
    <div className="flex h-[4.75rem] w-14 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/60 px-1 text-center text-[10px] font-medium leading-tight text-muted-foreground">
      +{count} more
    </div>
  );
}

function ObjektPreviewSide({
  preview,
}: {
  preview: ReturnType<typeof buildPreviewSide>;
}) {
  return (
    <div className="flex shrink-0 gap-2">
      {preview.entries.map((item) => (
        <ObjektThumb key={item.id} item={item} />
      ))}
      {preview.remaining > 0 && <MoreObjektsTile count={preview.remaining} />}
    </div>
  );
}

interface PosterCardProps {
  poster: PosterSummary;
  matchCount?: number;
  /** Omit to render a read-only card with no edit/delete controls (e.g. a dashboard preview). */
  onDelete?: (id: string) => void;
}

export function PosterCard({ poster, onDelete, matchCount }: PosterCardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const havePreview = buildPreviewSide(poster.haves);
  const wantPreview = buildPreviewSide(poster.wants);
  const haveCount = totalQuantity(poster.haves);
  const wantCount = totalQuantity(poster.wants);
  const hasPreview =
    havePreview.entries.length > 0 ||
    wantPreview.entries.length > 0 ||
    havePreview.remaining > 0 ||
    wantPreview.remaining > 0;
  const viewHref = sectionHref(`/list/${poster.id}`, {
    currentSection: "list",
  });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        sectionAbsoluteUrl(`/list/${poster.id}`),
      );
      setCopied(true);
      toast.success("Link copied!");
      window.setTimeout(() => setCopied(false), 1000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <div
      className="cursor-pointer rounded-lg border border-border bg-card p-4 space-y-3 transition-colors hover:border-primary/40 hover:bg-accent/20"
      onClick={() => router.push(viewHref)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(viewHref);
        }
      }}
      role="link"
      tabIndex={0}
      aria-label={`View ${poster.username ? `@${poster.username}'s list` : "trade list"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-medium truncate text-sm">
              {poster.username ? `@${poster.username}'s list` : "Trade list"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {haveCount} have · {wantCount} want ·{" "}
            {new Date(poster.updatedAt).toLocaleDateString("en-GB")}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7",
              copied &&
                "bg-emerald-600 text-white hover:bg-emerald-600 hover:text-white",
            )}
            onClick={(event) => {
              event.stopPropagation();
              void handleCopyLink();
            }}
            aria-label="Copy link"
            title="Copy link"
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5" />
            ) : (
              <CopyIcon className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <Link
              href={sectionHref(`/list/${poster.id}/edit`, {
                currentSection: "list",
              })}
              onClick={(event) => event.stopPropagation()}
              aria-label="Edit"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </Link>
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(poster.id);
              }}
              aria-label="Delete"
            >
              <Trash2Icon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {matchCount !== undefined && (
        <div
          className={cn(
            "w-fit rounded-full border px-2.5 py-1 text-[11px] font-medium",
            matchCount > 0
              ? "border-red-500/60 bg-red-500/10 text-red-400"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {matchCount > 99 ? "99+" : matchCount}{" "}
          {matchCount === 1 ? "match" : "matches"}
        </div>
      )}

      {hasPreview && (
        <div className="overflow-x-auto pb-1">
          <div className="flex w-max items-center gap-2">
            <ObjektPreviewSide preview={havePreview} />
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <ObjektPreviewSide preview={wantPreview} />
          </div>
        </div>
      )}
    </div>
  );
}
