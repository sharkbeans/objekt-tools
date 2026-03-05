"use client";

import Link from "next/link";
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

function ObjektLabels({ items }: { items: TradeItem[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <span key={item.id} className="text-xs">
          {item.collectionId}
        </span>
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
        <CardFooter className="pt-0">
          <p className="text-[10px] text-muted-foreground">
            {new Date(trade.createdAt).toLocaleDateString()}
          </p>
        </CardFooter>
      </Card>
    </Link>
  );
}
