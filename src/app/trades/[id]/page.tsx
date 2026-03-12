"use client";

import { use, useEffect, useState } from "react";
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
import { InitiateTradeDialog } from "@/components/trades/initiate-trade-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TradeItem {
  id: number;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  season?: string | null;
  class?: string | null;
  serial?: number | null;
}

function formatLabel(item: TradeItem) {
  return item.collectionNo && item.member
    ? `${item.member} ${item.collectionNo}`
    : item.collectionId;
}

function formatSerial(serial: number) {
  return `#${String(serial).padStart(5, "0")}`;
}

function useObjektImages(items: TradeItem[]) {
  const [images, setImages] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!items.length) return;

    const ids = items.map((i) => i.collectionId);
    const unique = [...new Set(ids)];

    unique.forEach((collectionId) => {
      fetch(`/api/objekts/search?q=${encodeURIComponent(collectionId)}`)
        .then((res) => res.json())
        .then((data) => {
          const match = data.results?.find(
            (r: any) => r.collectionId === collectionId
          );
          const url = match?.thumbnailImage ?? match?.frontImage;
          if (url) {
            setImages((prev) => new Map(prev).set(collectionId, url));
          }
        })
        .catch(() => {});
    });
  }, [items]);

  return images;
}

function ObjektImages({
  items,
  images,
  label,
  showSerial,
}: {
  items: TradeItem[];
  images: Map<string, string>;
  label: string;
  showSerial?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const url = images.get(item.collectionId);
          return (
            <div key={item.id} className="flex flex-col items-center gap-1">
              {url ? (
                <img
                  src={url}
                  alt={item.collectionId}
                  className="w-20 h-auto rounded-md border"
                />
              ) : (
                <div className="w-20 h-28 rounded-md border bg-muted animate-pulse" />
              )}
              <span className="text-[10px] text-muted-foreground text-center max-w-20 truncate">
                {formatLabel(item)}
              </span>
              {showSerial && item.serial != null && (
                <span className="text-[10px] text-muted-foreground">{formatSerial(item.serial)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ObjektList({ items, label, showSerial }: { items: TradeItem[]; label: string; showSerial?: boolean }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="text-sm px-2 py-1 rounded border border-border flex items-center justify-between"
          >
            <span>{formatLabel(item)}</span>
            {showSerial && item.serial != null && (
              <span className="text-xs text-muted-foreground">{formatSerial(item.serial)}</span>
            )}
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
  const queryClient = useQueryClient();
  const [initiateTarget, setInitiateTarget] = useState<{
    matchedTradePostId: number;
    theirHaves: TradeItem[];
  } | null>(null);
  // For non-owners: pick one of their own trade posts to initiate against this trade
  const [myPostPickerOpen, setMyPostPickerOpen] = useState(false);
  const [myInitiatePostId, setMyInitiatePostId] = useState<number | null>(null);
  const [myInitiateHaves, setMyInitiateHaves] = useState<TradeItem[]>([]);

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

  // Fetch the current user's open trades so they can initiate against this trade post
  const { data: myTradesData } = useQuery({
    queryKey: ["my-open-trades-for-initiate"],
    queryFn: async () => {
      const res = await fetch("/api/trades/mine?limit=50");
      return res.json();
    },
    enabled: !!session && !!trade && trade.status === "open",
  });
  const myOpenTrades: any[] = (myTradesData?.trades ?? []).filter((t: any) => t.status === "open");

  const haveImages = useObjektImages(trade?.haves ?? []);
  const wantImages = useObjektImages(trade?.wants ?? []);

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

  const { data: availabilityData } = useQuery({
    queryKey: ["trade-availability", id],
    queryFn: async () => {
      const res = await fetch(`/api/trades/${id}/check-availability`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to check availability");
      return res.json();
    },
    enabled: !!trade && trade.status === "open",
    staleTime: Number.POSITIVE_INFINITY, // only run once per page load
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!availabilityData) return;
    if (availabilityData.deleted) {
      toast.error("Trade removed — all offered objekts are no longer available.");
      queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["my-trades"] });
      queryClient.invalidateQueries({ queryKey: ["check-availability"] });
      router.push("/trades");
    } else if (availabilityData.removed > 0) {
      toast.warning(`${availabilityData.removed} objekt(s) removed — no longer in trader's inventory.`);
      queryClient.invalidateQueries({ queryKey: ["trade", id] });
      queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["my-trades"] });
      queryClient.invalidateQueries({ queryKey: ["check-availability"] });
    }
  }, [availabilityData]);

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
        {trade.haves?.length > 0 && trade.wants?.length > 0 && (
          <div className="px-6 pb-4 flex gap-6">
            <ObjektImages items={trade.haves} images={haveImages} label="HAVE" showSerial />
            <Separator orientation="vertical" className="h-auto" />
            <ObjektImages items={trade.wants} images={wantImages} label="WANT" />
          </div>
        )}
        <CardContent className="space-y-4">
          <ObjektList items={trade.haves} label="HAVE" showSerial />
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
          {trade.status === "open" && trade.cosmoNickname && (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-4 rounded-md bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Always verify the trader actually owns the listed objekts before trading.
                </p>
                <a
                  href={`https://objekt.top/@${trade.cosmoNickname}?transferable=true`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    View @{trade.cosmoNickname}
                  </Button>
                </a>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Non-owner: initiate trade against this post using one of their own matching trades */}
      {!isOwner && session && trade.status === "open" && myOpenTrades.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                You have {myOpenTrades.length} open trade{myOpenTrades.length !== 1 ? "s" : ""} — initiate a trade with this poster.
              </p>
              <Button size="sm" onClick={() => setMyPostPickerOpen(true)}>
                Initiate Trade
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
              <div key={match.id} className="flex flex-col gap-2">
                <TradeCard trade={match} />
                {isOwner && trade.status === "open" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setInitiateTarget({
                        matchedTradePostId: match.id,
                        theirHaves: match.haves,
                      })
                    }
                  >
                    Initiate Trade
                  </Button>
                )}
              </div>
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

      {/* Owner-side: initiate dialog (owner picking from their matches) */}
      {initiateTarget && (
        <InitiateTradeDialog
          open={!!initiateTarget}
          onOpenChange={(open) => { if (!open) setInitiateTarget(null); }}
          myTradePostId={Number(id)}
          myHaves={trade?.haves ?? []}
          matchedTradePostId={initiateTarget.matchedTradePostId}
          theirHaves={initiateTarget.theirHaves}
        />
      )}

      {/* Non-owner: pick which of their own trade posts to use */}
      <Dialog open={myPostPickerOpen} onOpenChange={setMyPostPickerOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select your trade post</DialogTitle>
            <DialogDescription>
              Choose one of your open trades to initiate against this post.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            {myOpenTrades.map((myTrade: any) => (
              <button
                key={myTrade.id}
                type="button"
                className="text-left rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
                onClick={() => {
                  setMyInitiatePostId(myTrade.id);
                  setMyInitiateHaves(myTrade.haves ?? []);
                  setMyPostPickerOpen(false);
                }}
              >
                <span className="font-medium">Trade #{myTrade.id}</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {myTrade.haves?.length ?? 0} have · {myTrade.wants?.length ?? 0} want
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Non-owner: initiate dialog (their post vs this trade) */}
      {myInitiatePostId && (
        <InitiateTradeDialog
          open={!!myInitiatePostId}
          onOpenChange={(open) => { if (!open) { setMyInitiatePostId(null); setMyInitiateHaves([]); } }}
          myTradePostId={myInitiatePostId}
          myHaves={myInitiateHaves}
          matchedTradePostId={Number(id)}
          theirHaves={trade?.haves ?? []}
        />
      )}
    </div>
  );
}
