"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { membersByArtist } from "@/lib/filters";

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
}

function anyWantLabel(item: TradeItem): string {
  if (item.member) return `Any ${item.member}`;
  if (item.season && item.artist) return `Any ${item.artist} ${item.season}`;
  if (item.season) return `Any ${item.season}`;
  if (item.artist) return `Any ${item.artist}`;
  if (item.class) return `Any ${item.class}`;
  return "Any";
}

function formatObjektLabel(item: { collectionId: string; collectionNo?: string | null; member?: string | null; season?: string | null; artist?: string | null; class?: string | null; serial?: number | null }, showSerial?: boolean) {
  const name = item.collectionNo && item.member
    ? [item.artist, item.season, item.member, item.collectionNo].filter(Boolean).join(" ")
    : item.collectionId;
  const right = [
    item.class,
    showSerial && item.serial != null ? `#${String(item.serial).padStart(5, "0")}` : null,
  ].filter(Boolean).join(" ");
  return { name, right };
}

function buildObjektTopUrl(item: TradeItem, cosmoNickname: string | null | undefined, showSerial?: boolean): string {
  const parts: string[] = [];
  if (item.member) {
    const artist = Object.entries(membersByArtist).find(([, members]) => members.includes(item.member!))?.[0];
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
    id: number;
    description?: string | null;
    status: string;
    createdAt: string;
    user: { id: string; name: string; image?: string | null };
    cosmoNickname?: string | null;
    haves: TradeItem[];
    wants: TradeItem[];
  };
  matchCount?: number;
}

const imageCache = new Map<string, string | null>();

const THUMBNAIL_VISIBLE = 4;

function ObjektThumbnailStrip({ items }: { items: TradeItem[] }) {
  const nonAny = items.filter((i) => !i.isAny);
  const anyItems = items.filter((i) => i.isAny);
  const visible = nonAny.slice(0, THUMBNAIL_VISIBLE);
  const overflow = nonAny.length - visible.length;

  const [images, setImages] = useState<Map<string, string | null>>(() => {
    const m = new Map<string, string | null>();
    for (const item of visible) {
      const cached = imageCache.get(item.collectionId);
      if (cached !== undefined) m.set(item.collectionId, cached);
    }
    return m;
  });

  useEffect(() => {
    const missing = visible.filter((i) => !imageCache.has(i.collectionId));
    if (missing.length === 0) return;

    for (const item of missing) {
      fetch(`/api/objekts/search?q=${encodeURIComponent(item.collectionId)}`)
        .then((res) => res.json())
        .then((data) => {
          const match = data.results?.find(
            (r: any) => r.collectionId === item.collectionId
          );
          const url = match?.thumbnailImage ?? match?.frontImage ?? null;
          imageCache.set(item.collectionId, url);
          setImages((prev) => new Map(prev).set(item.collectionId, url));
        })
        .catch(() => {
          imageCache.set(item.collectionId, null);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((item) => {
        const url = images.get(item.collectionId);
        // url === undefined: not yet fetched (show pulse placeholder)
        // url === null: fetched but no image found (skip)
        // url === string: show image
        if (url === null) return null;
        return url ? (
          <img
            key={item.id}
            src={url}
            alt={item.collectionId}
            title={item.collectionNo && item.member ? `${item.member} ${item.collectionNo}` : item.collectionId}
            className="w-9 h-auto rounded-sm object-cover shrink-0"
          />
        ) : (
          <div
            key={item.id}
            className="w-9 h-12 rounded-sm bg-muted animate-pulse shrink-0"
          />
        );
      })}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground font-medium">+{overflow}</span>
      )}
      {anyItems.map((item) => (
        <span key={item.id} className="text-[10px] text-muted-foreground italic">
          {anyWantLabel(item)}
        </span>
      ))}
    </div>
  );
}

function ObjektLabel({ item, showSerial, cosmoNickname }: { item: TradeItem; showSerial?: boolean; cosmoNickname?: string | null }) {
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
          (r: any) => r.collectionId === item.collectionId
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
      className="text-xs relative cursor-default inline-flex items-center gap-1"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {label.name}
      {label.right && (
        <span className="text-muted-foreground ml-1">{label.right}</span>
      )}
      <a
        href={buildObjektTopUrl(item, cosmoNickname, showSerial)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
        title="View on Objekt.top"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        </svg>
      </a>
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

function ObjektLabels({ items, showSerial, cosmoNickname }: { items: TradeItem[]; showSerial?: boolean; cosmoNickname?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) =>
        item.isAny ? (
          <span key={item.id} className="text-xs text-muted-foreground italic">
            {anyWantLabel(item)}
          </span>
        ) : (
          <ObjektLabel key={item.id} item={item} showSerial={showSerial} cosmoNickname={cosmoNickname} />
        )
      )}
    </div>
  );
}

export function TradeCard({ trade, matchCount }: TradeCardProps) {
  return (
    <Link href={`/trades/${trade.id}`} className="relative">
      {matchCount != null && matchCount > 0 && (
        <span className="absolute -top-2 -right-2 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
          {matchCount > 99 ? "99+" : matchCount}
        </span>
      )}
      <Card className="hover:border-primary/50 transition-colors h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{trade.user.name}</span>
              {trade.cosmoNickname && (
                <Badge variant="secondary" className="text-xs">
                  @{trade.cosmoNickname}
                </Badge>
              )}
            </div>
            <Badge
              variant={trade.status === "open" ? "default" : "secondary"}
              className="text-xs"
            >
              {trade.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1 font-medium">
              HAVE
            </p>
            <ObjektThumbnailStrip items={trade.haves} />
            <div className="mt-1">
              <ObjektLabels items={trade.haves} showSerial cosmoNickname={trade.cosmoNickname} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 font-medium">
              WANT
            </p>
            <ObjektThumbnailStrip items={trade.wants} />
            <div className="mt-1">
              <ObjektLabels items={trade.wants} />
            </div>
          </div>
          {trade.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {trade.description}
            </p>
          )}
        </CardContent>
        <CardFooter className="pt-0 flex justify-between items-center">
          <p className="text-[10px] text-muted-foreground">
            {new Date(trade.createdAt).toLocaleDateString()}
          </p>
          {trade.cosmoNickname && (
            <a
              href={`https://objekt.top/@${trade.cosmoNickname}?transferable=true`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Verify inventory
            </a>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
