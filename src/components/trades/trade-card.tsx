"use client";

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { membersByArtist } from "@/lib/filters";
import { anyWantLabel, formatShortLabel } from "@/lib/objekt-label";
import type { ObjektSearchResult } from "@/lib/trade-types";

interface TradeItem {
  id: number;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  season?: string | null;
  class?: string | null;
  serial?: number | null;
  isAny?: boolean;
  artist?: string | null;
  thumbnailUrl?: string | null;
}

function formatObjektLabel(
  item: {
    collectionId: string;
    collectionNo?: string | null;
    member?: string | null;
    season?: string | null;
    artist?: string | null;
    class?: string | null;
    serial?: number | null;
  },
  showSerial?: boolean,
) {
  const name =
    item.collectionNo && item.member
      ? [item.member, item.collectionNo].filter(Boolean).join(" ")
      : item.collectionId;
  const right = [
    item.class,
    showSerial && item.serial != null
      ? `#${String(item.serial).padStart(5, "0")}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { name, right };
}

function buildObjektTopUrl(
  item: TradeItem,
  cosmoNickname: string | null | undefined,
  showSerial?: boolean,
): string {
  const parts: string[] = [];
  if (item.member) {
    const artist = Object.entries(membersByArtist).find(([, members]) =>
      members.includes(item.member!),
    )?.[0];
    if (artist) parts.push(artist);
  }
  if (item.season) parts.push(item.season);
  if (item.member) parts.push(item.member);
  if (item.collectionNo) parts.push(item.collectionNo);
  if (showSerial && item.serial != null) parts.push(`#${item.serial}`);
  const search = parts.join(" ");
  const basePath = cosmoNickname ? `/@${cosmoNickname}` : "";
  return `https://objekt.top${basePath}?${new URLSearchParams({ search }).toString()}`;
}

interface TradeCardProps {
  trade: {
    id: string;
    description?: string | null;
    status: string;
    createdAt: string;
    wantsOnly?: boolean;
    user: { id: string; name: string; image?: string | null };
    cosmoNickname?: string | null;
    cosmoAddress?: string | null;
    haves: TradeItem[];
    wants: TradeItem[];
  };
  matchCount?: number;
}

const imageCache = new Map<string, string | null>();

function ObjektThumb({ item }: { item: TradeItem }) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    item.thumbnailUrl ?? null,
  );
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const ensureImage = useCallback(() => {
    if (imageUrl || failed || fetchedRef.current) return;
    fetchedRef.current = true;

    const cached = imageCache.get(item.collectionId);
    if (cached !== undefined) {
      if (cached) setImageUrl(cached);
      else setFailed(true);
      return;
    }

    fetch(`/api/objekts/search?q=${encodeURIComponent(item.collectionId)}`)
      .then((res) => res.json())
      .then((data) => {
        const match = data.results?.find(
          (r: ObjektSearchResult) => r.collectionId === item.collectionId,
        );
        const url = match?.thumbnailImage ?? match?.frontImage ?? null;
        imageCache.set(item.collectionId, url);
        if (url) setImageUrl(url);
        else setFailed(true);
      })
      .catch(() => {
        imageCache.set(item.collectionId, null);
        setFailed(true);
      });
  }, [item.collectionId, imageUrl, failed]);

  if (item.isAny) return null;

  return (
    <div
      ref={thumbRef}
      className="w-12 h-18 rounded bg-muted/40 border border-border/50 shrink-0 overflow-hidden"
      onMouseEnter={() => {
        ensureImage();
        if (thumbRef.current) setRect(thumbRef.current.getBoundingClientRect());
        setHover(true);
      }}
      onMouseLeave={() => setHover(false)}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={item.collectionId}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          ref={() => ensureImage()}
        />
      )}
      {hover &&
        imageUrl &&
        rect &&
        createPortal(
          <div
            className="fixed z-50 rounded-md overflow-hidden shadow-lg border bg-background pointer-events-none"
            style={{ top: rect.top, right: window.innerWidth - rect.left + 8 }}
          >
            <img
              src={imageUrl}
              alt={item.collectionId}
              className="w-32 h-auto block"
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Compact item row: small thumbnail + "SeoYeon AA101Z" + serial */
function CompactItem({ item }: { item: TradeItem }) {
  if (item.isAny) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-12 h-18 rounded bg-muted/60 border border-dashed border-muted-foreground/30 shrink-0" />
        <span className="text-xs text-muted-foreground italic truncate">
          {anyWantLabel(item)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <ObjektThumb item={item} />
      <div className="min-w-0">
        <p className="text-xs truncate">{formatShortLabel(item)}</p>
        {item.serial != null && (
          <p className="text-[11px] text-muted-foreground">
            #{String(item.serial).padStart(5, "0")}
          </p>
        )}
      </div>
    </div>
  );
}

/** List of items with overflow count */
function CompactItemList({
  items,
  max = 3,
}: {
  items: TradeItem[];
  max?: number;
}) {
  const visible = items.slice(0, max);
  const overflow = items.length - max;

  return (
    <div className="flex flex-col gap-1 min-w-0">
      {visible.map((item) => (
        <CompactItem key={item.id} item={item} />
      ))}
      {overflow > 0 && (
        <span className="text-[11px] text-muted-foreground pl-14">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

// Full text list with hover preview — exported for detail pages
function ObjektLabel({
  item,
  showSerial,
  cosmoNickname,
}: {
  item: TradeItem;
  showSerial?: boolean;
  cosmoNickname?: string | null;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const fetchedRef = useRef(false);

  const handleMouseEnter = useCallback(() => {
    setShow(true);
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const cached = imageCache.get(item.collectionId);
    if (cached !== undefined) {
      setImageUrl(cached);
      return;
    }

    fetch(`/api/objekts/search?q=${encodeURIComponent(item.collectionId)}`)
      .then((res) => res.json())
      .then((data) => {
        const match = data.results?.find(
          (r: ObjektSearchResult) => r.collectionId === item.collectionId,
        );
        const url = match?.thumbnailImage ?? match?.frontImage ?? null;
        imageCache.set(item.collectionId, url);
        setImageUrl(url);
      })
      .catch(() => {
        imageCache.set(item.collectionId, null);
      });
  }, [item.collectionId]);

  const label = formatObjektLabel(item, showSerial);

  return (
    <span
      className="text-xs relative cursor-default flex items-center w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      <span className="flex items-center gap-1 min-w-0">{label.name}</span>
      {label.right && (
        <span className="text-muted-foreground ml-auto pl-2 shrink-0">
          {label.right}
        </span>
      )}
      <button
        type="button"
        className="ml-2 text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          window.open(
            buildObjektTopUrl(item, cosmoNickname, showSerial),
            "_blank",
            "noopener,noreferrer",
          );
        }}
        title="View on Objekt.top"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      </button>
      {show && imageUrl && (
        <span className="absolute left-0 bottom-full mb-1 z-50 rounded-md overflow-hidden shadow-lg border bg-background">
          <img
            src={imageUrl}
            alt={item.collectionId}
            className="w-24 h-auto block"
          />
        </span>
      )}
    </span>
  );
}

export function ObjektLabels({
  items,
  showSerial,
  cosmoNickname,
}: {
  items: TradeItem[];
  showSerial?: boolean;
  cosmoNickname?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 w-full">
      {items.map((item) =>
        item.isAny ? (
          <span key={item.id} className="text-xs text-muted-foreground italic">
            {anyWantLabel(item)}
          </span>
        ) : (
          <ObjektLabel
            key={item.id}
            item={item}
            showSerial={showSerial}
            cosmoNickname={cosmoNickname}
          />
        ),
      )}
    </div>
  );
}

export function TradeCard({ trade, matchCount }: TradeCardProps) {
  return (
    <Link href={`/trades/${trade.id}`} className="relative group">
      {matchCount != null && matchCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {matchCount > 99 ? "99+" : matchCount}
        </span>
      )}
      <div className="rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors h-full flex flex-col gap-2">
        {/* Header: user + date */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <span className="text-xs font-medium truncate">
              {trade.cosmoNickname
                ? `@${trade.cosmoNickname}`
                : trade.user.name}
            </span>
            {trade.wantsOnly && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 shrink-0"
              >
                Wants Only
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {new Date(trade.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>

        {/* HAVE → WANT with compact item lists */}
        <div className="flex gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">
              HAVE
            </p>
            <CompactItemList items={trade.haves} max={3} />
          </div>
          <div className="flex items-center shrink-0 px-0.5">
            <ArrowRightIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">
              WANT
            </p>
            <CompactItemList items={trade.wants} max={3} />
          </div>
        </div>

        {/* Description preview */}
        {trade.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-1 leading-tight">
            {trade.description}
          </p>
        )}
      </div>
    </Link>
  );
}
