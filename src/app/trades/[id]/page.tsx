"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TradeCard } from "@/components/trades/trade-card";
import { toast } from "sonner";

interface TradeItem {
  id: number;
  collectionId: string;
  member?: string | null;
  season?: string | null;
  class?: string | null;
}

function ObjektList({ items, label }: { items: TradeItem[]; label: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="text-sm px-2 py-1 rounded border border-border"
          >
            {item.collectionId}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const router = useRouter();

  const { data: trade, isLoading: tradeLoading } = useQuery({
    queryKey: ["trade", id],
    queryFn: async () => {
      const res = await fetch(`/api/trades/${id}`);
      if (!res.ok) throw new Error("Trade not found");
      return res.json();
    },
  });

  const { data: matchData, isLoading: matchesLoading } = useQuery({
    queryKey: ["trade-matches", id],
    queryFn: async () => {
      const res = await fetch(`/api/trades/${id}/matches`);
      return res.json();
    },
    enabled: !!trade,
  });

  async function handleClose() {
    try {
      const res = await fetch(`/api/trades/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (!res.ok) throw new Error("Failed to close trade");
      toast.success("Trade closed");
      router.refresh();
    } catch (error) {
      toast.error("Failed to close trade");
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete trade");
      toast.success("Trade deleted");
      router.push("/trades");
    } catch (error) {
      toast.error("Failed to delete trade");
    }
  }

  if (tradeLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading trade...
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Trade not found
      </div>
    );
  }

  const isOwner = session?.user?.id === trade.user?.id;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Trade details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Trade #{trade.id}
                <Badge
                  variant={trade.status === "open" ? "default" : "secondary"}
                >
                  {trade.status}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                by {trade.user.name}
                {trade.cosmoNickname && (
                  <span className="ml-1">(@{trade.cosmoNickname})</span>
                )}
                {" · "}
                {new Date(trade.createdAt).toLocaleDateString()}
              </CardDescription>
            </div>
            {isOwner && trade.status === "open" && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Close Trade
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ObjektList items={trade.haves} label="HAVE" />
          <Separator />
          <ObjektList items={trade.wants} label="WANT" />
          {trade.description && (
            <>
              <Separator />
              <p className="text-sm text-muted-foreground">
                {trade.description}
              </p>
            </>
          )}
          {trade.cosmoNickname && (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-4 rounded-md bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Always verify the trader actually owns the listed objekts before trading.
                </p>
                <a
                  href={`https://objekt.top/@${trade.cosmoNickname}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    Verify @{trade.cosmoNickname}
                  </Button>
                </a>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Matches */}
      <div>
        <h2 className="text-xl font-bold mb-4">
          Matching Trades
          {matchData?.matches && (
            <span className="text-muted-foreground font-normal text-base ml-2">
              ({matchData.matches.length} found)
            </span>
          )}
        </h2>

        {matchesLoading ? (
          <p className="text-muted-foreground">Finding matches...</p>
        ) : matchData?.matches?.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {matchData.matches.map((match: any) => (
              <TradeCard key={match.id} trade={match} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No matching trades found yet. Check back later!
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
