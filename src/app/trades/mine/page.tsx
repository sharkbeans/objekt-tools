"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TradeCard } from "@/components/trades/trade-card";
import { TradePagination } from "@/components/trades/trade-pagination";
import { TradeFilters, defaultFilters, type TradeFilterState } from "@/components/trades/trade-filters";
import { ActiveTradesBanner } from "@/components/trades/active-trades-banner";
import { XIcon, AlertTriangleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function buildParams(filters: TradeFilterState, page: number) {
  const p = new URLSearchParams();
  p.set("page", String(page));
  for (const a of filters.artist) p.append("artist", a);
  for (const m of filters.member) p.append("member", m);
  for (const s of filters.season) p.append("season", s);
  for (const c of filters.class) p.append("class", c);
  for (const o of filters.on_offline) p.append("on_offline", o);
  if (filters.search) p.set("search", filters.search);
  if (filters.sort) p.set("sort", filters.sort);
  p.set("filter_mode", filters.filterMode);
  return p;
}

function TradeNotifications() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["trade-notifications"],
    queryFn: async () => {
      const res = await fetch("/api/trades/mine/notifications");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const dismiss = useMutation({
    mutationFn: async (ids: number[]) => {
      await fetch("/api/trades/mine/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
    },
  });

  const notifications = data?.notifications ?? [];
  if (notifications.length === 0) return null;

  return (
    <div className="space-y-2">
      {notifications.map((n: { id: number; message: string; createdAt: string }) => (
        <div
          key={n.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-500/35 dark:border-amber-900 dark:bg-amber-500/35 p-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangleIcon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm">{n.message}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss.mutate([n.id])}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
      {notifications.length > 1 && (
        <button
          type="button"
          onClick={() => dismiss.mutate(notifications.map((n: { id: number }) => n.id))}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss all
        </button>
      )}
    </div>
  );
}


export default function MyTradesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<TradeFilterState>(defaultFilters);
  const [page, setPage] = useState(1);

  const handleFiltersChange = useCallback((next: TradeFilterState) => {
    setFilters(next);
    setPage(1);
  }, []);

  useEffect(() => {
    if (session === null) router.push("/sign-in");
  }, [session, router]);

  // Trigger availability check on page load
  const { isFetching: isChecking } = useQuery({
    queryKey: ["check-availability"],
    queryFn: async () => {
      const res = await fetch("/api/trades/mine/check-availability", {
        method: "POST",
      });
      const data = await res.json();
      if (data.removed > 0 || data.updated > 0) {
        queryClient.invalidateQueries({ queryKey: ["my-trades"] });
        queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
      }
      return data;
    },
    enabled: !!session,
    staleTime: 5 * 60 * 1000, // only re-check every 5 minutes
    refetchOnWindowFocus: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["my-trades", filters, page],
    queryFn: async () => {
      const res = await fetch(`/api/trades/mine?${buildParams(filters, page)}`);
      return res.json();
    },
    enabled: !!session,
  });

  const trades = data?.trades ?? [];
  const total: number = data?.total ?? 0;
  const limit: number = data?.limit ?? 12;
  const totalPages = Math.ceil(total / limit);

  const tradeIds: number[] = trades.map((t: any) => t.id);

  const { data: matchCounts } = useQuery({
    queryKey: ["my-trades-match-counts", tradeIds],
    queryFn: async () => {
      const results = await Promise.all(
        tradeIds.map(async (id) => {
          const res = await fetch(`/api/trades/${id}/matches`);
          const json = await res.json();
          return { id, count: json.matches?.length ?? 0 };
        })
      );
      return Object.fromEntries(results.map((r) => [r.id, r.count]));
    },
    enabled: tradeIds.length > 0,
  });

  if (!session) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Trades</h1>
          <p className="text-muted-foreground">
            Manage your trade posts and see matches
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/trades/new">New Trade</Link>
        </Button>
      </div>

      {isChecking && (
        <p className="text-xs text-muted-foreground">Checking objekt availability...</p>
      )}

      <TradeNotifications />

      <ActiveTradesBanner />

      <TradeFilters filters={filters} onChange={handleFiltersChange} />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading your trades...
        </div>
      ) : trades.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trades.map((trade: any) => (
              <TradeCard key={trade.id} trade={trade} matchCount={matchCounts?.[trade.id]} />
            ))}
          </div>
          <TradePagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
          />
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You haven&apos;t posted any trades yet.{" "}
            <Link href="/trades/new" className="text-primary hover:underline">
              Create your first trade
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
