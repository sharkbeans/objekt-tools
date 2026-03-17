"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
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
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        onClick={(e) => { e.stopPropagation(); window.open(buildObjektTopUrl(item, cosmoNickname, showSerial), "_blank", "noopener,noreferrer"); }}
        title="View on Objekt.top"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
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
            <ObjektLabels items={trade.haves} showSerial cosmoNickname={trade.cosmoNickname} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 font-medium">
              WANT
            </p>
            <ObjektLabels items={trade.wants} />
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
            <button
              type="button"
              className="text-[10px] text-primary hover:underline"
              onClick={(e) => { e.stopPropagation(); window.open(`https://objekt.top/@${trade.cosmoNickname}?transferable=true`, "_blank", "noopener,noreferrer"); }}
            >
              Verify inventory
            </button>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
