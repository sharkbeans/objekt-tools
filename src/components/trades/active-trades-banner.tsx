"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { XIcon } from "lucide-react";

type TradeStatus = "pending" | "accepted" | "partial" | "completed" | "cancelled" | "disputed";

const statusVariant: Record<TradeStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  accepted: "default",
  partial: "default",
  completed: "default",
  cancelled: "destructive",
  disputed: "destructive",
};

const DISMISSED_KEY = "dismissed-active-trades";

function getDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<number>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

const terminalStatuses: TradeStatus[] = ["completed", "cancelled", "disputed"];

export function ActiveTradesBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    setDismissed(getDismissed());
  }, []);

  const { data } = useQuery({
    queryKey: ["my-active-trades"],
    queryFn: async () => {
      const res = await fetch("/api/active-trades");
      return res.json();
    },
    enabled: !!session,
    refetchInterval: 30_000,
  });

  if (!session) return null;

  const allTrades = data?.trades ?? [];

  // Active (non-terminal) trades are never dismissable — always shown
  // Terminal trades can be dismissed via X button
  const visibleTrades = allTrades.filter((t: any) => {
    if (!terminalStatuses.includes(t.status)) return true; // always show active
    return !dismissed.has(t.id); // terminal: show unless dismissed
  });

  if (visibleTrades.length === 0) return null;

  const userId = session.user?.id;

  function dismissOne(id: number) {
    const next = new Set(dismissed);
    next.add(id);
    saveDismissed(next);
    setDismissed(next);
  }

  return (
    <div className="space-y-2">
      {visibleTrades.map((trade: any) => {
        const isRecipient = trade.recipientUserId === userId;
        const otherUser = isRecipient ? trade.initiator : trade.recipient;
        const needsAccept = isRecipient && trade.status === "pending";
        const isTerminal = terminalStatuses.includes(trade.status);

        return (
          <div key={trade.id} className="flex items-center gap-2">
            <Link
              href={`/active-trades/${trade.id}`}
              className="flex flex-1 items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors min-w-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant={statusVariant[trade.status as TradeStatus]} className="capitalize shrink-0">
                  {trade.status}
                </Badge>
                <span className="text-sm truncate">
                  Trade #{trade.id} with {otherUser.cosmoNickname ?? otherUser.name}
                </span>
              </div>
              {needsAccept && (
                <Badge variant="default" className="shrink-0">
                  Action Required
                </Badge>
              )}
            </Link>
            {isTerminal && (
              <button
                type="button"
                onClick={() => dismissOne(trade.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
