"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ActiveTradesBanner } from "@/components/trades/active-trades-banner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

type TradeStatus = "completed" | "cancelled" | "countered" | "disputed";

interface TradeSide {
  status: string;
}

interface HistoryTrade {
  id: number;
  status: TradeStatus;
  updatedAt: string;
  acceptedAt: string | null;
  initiatorUserId: string;
  recipientUserId: string;
  counterOfferId?: string | null;
  initiator: { id: string; name: string; cosmoNickname?: string | null };
  recipient: { id: string; name: string; cosmoNickname?: string | null };
  sides: TradeSide[];
}

/** Declined = cancelled before either party ever accepted (acceptedAt is null) */
function getDisplayStatus(trade: HistoryTrade): {
  label: string;
  variant: "default" | "destructive" | "secondary" | "outline";
  className?: string;
} {
  if (trade.status === "completed")
    return { label: "Completed", variant: "default" };
  if (trade.status === "disputed")
    return { label: "Disputed", variant: "destructive" };
  if (trade.status === "countered")
    return {
      label: "Countered",
      variant: "outline",
      className: "border-blue-500/60 text-blue-400",
    };
  if (trade.status === "cancelled") {
    const wasAccepted = trade.acceptedAt != null;
    return wasAccepted
      ? { label: "Cancelled", variant: "destructive" }
      : {
          label: "Declined",
          variant: "outline",
          className: "border-red-500/60 text-red-400",
        };
  }
  return { label: trade.status, variant: "secondary" };
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString("en-GB", {
    timeZone: "GMT",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    timeZone: "GMT",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time} GMT`;
}

export default function TradeHistoryPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  function navigateToTrade(tradeId: number) {
    router.push(
      sectionHref(`/active-trades/${tradeId}`, {
        currentSection: "trade",
      }),
    );
  }

  useEffect(() => {
    if (!isPending && session === null) router.push("/sign-in");
  }, [session, isPending, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["active-trades-history"],
    queryFn: async () => {
      const res = await fetch("/api/active-trades/history");
      return res.json();
    },
    enabled: !!session,
  });

  const trades: HistoryTrade[] = data?.trades ?? [];

  if (!session) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trade History</h1>
          <p className="text-muted-foreground">Completed and past trades</p>
        </div>
        <Link
          href={sectionHref("/trades/mine", { currentSection: "trade" })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← My Trades
        </Link>
      </div>

      <ActiveTradesBanner />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading...
        </div>
      ) : trades.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No trade history yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {trades.map((trade) => {
            const userId = session.user?.id;
            const isRecipient = trade.recipientUserId === userId;
            const otherUser = isRecipient ? trade.initiator : trade.recipient;
            const display = getDisplayStatus(trade);
            return (
              <div
                key={trade.id}
                className="rounded-lg border transition-colors flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => navigateToTrade(trade.id)}
                >
                  <Badge
                    variant={display.variant}
                    className={cn(
                      "shrink-0 w-24 justify-center",
                      display.className,
                    )}
                  >
                    {display.label}
                  </Badge>
                  <span className="text-sm flex-1 min-w-0 truncate">
                    Trade #{trade.id} with{" "}
                    <span className="font-medium">
                      {otherUser.cosmoNickname ?? otherUser.name}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {formatDate(trade.updatedAt)}
                  </span>
                </button>
                {trade.status === "countered" && trade.counterOfferId && (
                  <Link
                    href={sectionHref(
                      `/active-trades/${trade.counterOfferId}`,
                      {
                        currentSection: "trade",
                      },
                    )}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
                  >
                    View counter-offer →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
