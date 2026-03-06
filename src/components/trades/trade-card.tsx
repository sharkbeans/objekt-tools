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
  member?: string | null;
  season?: string | null;
  class?: string | null;
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
}

const imageCache = new Map<string, string | null>();

function ObjektLabel({ item }: { item: TradeItem }) {
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

  return (
    <span
      className="text-xs relative cursor-default"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {item.collectionId}
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

function ObjektLabels({ items }: { items: TradeItem[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <ObjektLabel key={item.id} item={item} />
      ))}
    </div>
  );
}

export function TradeCard({ trade }: TradeCardProps) {
  return (
    <Link href={`/trades/${trade.id}`}>
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
            <ObjektLabels items={trade.haves} />
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
