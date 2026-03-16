"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

const terminalStatuses: TradeStatus[] = ["completed", "cancelled", "disputed"];

export function ActiveTradesBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

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

  function dismissOne(id: string) {
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

        const bannerClass = cn(
          "flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors min-w-0",
          trade.status === "completed"
            ? "border-green-300 bg-green-500/20 dark:border-green-800 dark:bg-green-500/20 hover:bg-green-500/25"
            : trade.status === "pending"
            ? "border-amber-200 bg-amber-500/35 dark:border-amber-900 dark:bg-amber-500/35 hover:bg-amber-500/40"
            : trade.status === "cancelled" || trade.status === "disputed"
            ? "border-destructive/40 bg-destructive/15 dark:bg-destructive/20 hover:bg-destructive/20"
            : "border-border hover:bg-muted/50"
        );

        return (
          <div key={trade.id} className={bannerClass}>
            <Link
              href={`/active-trades/${trade.id}`}
              className="flex flex-1 items-center justify-between gap-3 min-w-0"
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
