"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ActiveTradesBanner } from "@/components/trades/active-trades-banner";

type TradeStatus = "completed" | "cancelled" | "disputed";

const statusVariant: Record<TradeStatus, "default" | "destructive" | "secondary"> = {
  completed: "default",
  cancelled: "destructive",
  disputed: "destructive",
};

interface HistoryTrade {
  id: number;
  status: TradeStatus;
  updatedAt: string;
  initiatorUserId: string;
  recipientUserId: string;
  initiator: { id: string; name: string; cosmoNickname?: string | null };
  recipient: { id: string; name: string; cosmoNickname?: string | null };
}

export default function TradeHistoryPage() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.push("/sign-in");
  }, [session, router]);

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
          <p className="text-muted-foreground">Completed and cancelled trades</p>
        </div>
        <Link href="/trades/mine" className="text-sm text-muted-foreground hover:text-foreground">
          ← My Trades
        </Link>
      </div>

      <ActiveTradesBanner />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
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
            return (
              <Link
                key={trade.id}
                href={`/active-trades/${trade.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge
                    variant={statusVariant[trade.status]}
                    className="capitalize shrink-0"
                  >
                    {trade.status}
                  </Badge>
                  <span className="text-sm truncate">
                    Trade #{trade.id} with {otherUser.cosmoNickname ?? otherUser.name}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(trade.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
