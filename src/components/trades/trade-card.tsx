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

interface TradeItem {
  id: number;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  season?: string | null;
  class?: string | null;
  serial?: number | null;
}

function formatObjektLabel(item: { collectionId: string; collectionNo?: string | null; member?: string | null; serial?: number | null }, showSerial?: boolean) {
  const name = item.collectionNo && item.member
    ? `${item.member} ${item.collectionNo}`
    : item.collectionId;
  const serial = showSerial && item.serial != null
    ? ` #${String(item.serial).padStart(5, "0")}`
    : "";
  return { name, serial };
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

function ObjektLabel({ item, showSerial }: { item: TradeItem; showSerial?: boolean }) {
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
      className="text-xs relative cursor-default"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {label.name}
      {label.serial && (
        <span className="text-muted-foreground ml-1">{label.serial}</span>
      )}
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

function ObjektLabels({ items, showSerial }: { items: TradeItem[]; showSerial?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <ObjektLabel key={item.id} item={item} showSerial={showSerial} />
      ))}
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
            <ObjektLabels items={trade.haves} showSerial />
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
            <a
              href={`https://objekt.top/@${trade.cosmoNickname}`}
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
