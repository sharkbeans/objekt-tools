"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  defaultFilters,
  ObjektFilterBar,
  type ObjektFilterState,
} from "@/components/objekt/objekt-filter-bar";
import { TradeCard } from "@/components/trades/trade-card";
import { TradePagination } from "@/components/trades/trade-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { sectionHref } from "@/lib/sections";
import type {
  ActiveTradeDTO,
  TradePostDTO,
  TradeStatus,
} from "@/lib/trade-types";
import { cn } from "@/lib/utils";

const statusVariant: Record<
  TradeStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  accepted: "default",
  partial: "default",
  completed: "default",
  cancelled: "destructive",
  countered: "outline",
  disputed: "destructive",
};

const statusLabel: Record<TradeStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  partial: "Ongoing",
  completed: "Completed",
  cancelled: "Cancelled",
  countered: "Countered",
  disputed: "Disputed",
};

function buildParams(filters: ObjektFilterState, page: number) {
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
      {notifications.map(
        (n: { id: number; message: string; createdAt: string }) => {
          const activeTradeMatch = n.message.match(
            /Active Trade #([a-zA-Z0-9]+)/,
          );
          const activeTradeId = activeTradeMatch?.[1] ?? null;

          const inner = (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <AlertTriangleIcon className="h-4 w-4 shrink-0 text-warning" />
                <p className="text-sm">{n.message}</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  dismiss.mutate([n.id]);
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </>
          );

          return activeTradeId ? (
            <Link
              key={n.id}
              href={sectionHref(`/active-trades/${activeTradeId}`, {
                currentSection: "trade",
              })}
              className="banner-warning flex items-center justify-between gap-3"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={n.id}
              className="banner-warning flex items-center justify-between gap-3"
            >
              {inner}
            </div>
          );
        },
      )}
      {notifications.length > 1 && (
        <button
          type="button"
          onClick={() =>
            dismiss.mutate(notifications.map((n: { id: number }) => n.id))
          }
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss all
        </button>
      )}
    </div>
  );
}

export default function MyTradesPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ObjektFilterState>(defaultFilters);
  const [page, setPage] = useState(1);
  const [activePage, setActivePage] = useState(1);

  const handleFiltersChange = useCallback((next: ObjektFilterState) => {
    setFilters(next);
    setPage(1);
  }, []);

  useEffect(() => {
    if (!isPending && session === null) router.push("/sign-in");
  }, [session, isPending, router]);

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
    staleTime: 5 * 60 * 1000,
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

  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ["my-active-trades", activePage],
    queryFn: async () => {
      const res = await fetch(`/api/active-trades?page=${activePage}`);
      return res.json();
    },
    enabled: !!session,
    refetchInterval: 30_000,
  });

  const trades = data?.trades ?? [];
  const total: number = data?.total ?? 0;
  const limit: number = data?.limit ?? 12;
  const totalPages = Math.ceil(total / limit);

  const activeTrades: ActiveTradeDTO[] = activeData?.trades ?? [];
  const activeTotal: number = activeData?.total ?? 0;
  const activeLimit: number = activeData?.limit ?? 12;
  const activeTotalPages = Math.ceil(activeTotal / activeLimit);

  const tradeIds: string[] = trades.map((t: TradePostDTO) => t.id);

  const { data: matchCounts } = useQuery({
    queryKey: ["my-trades-match-counts", tradeIds],
    queryFn: async () => {
      const results = await Promise.all(
        tradeIds.map(async (id) => {
          const res = await fetch(`/api/trades/${id}/matches`);
          const json = await res.json();
          return { id, count: json.matches?.length ?? 0 };
        }),
      );
      return Object.fromEntries(results.map((r) => [r.id, r.count]));
    },
    enabled: tradeIds.length > 0,
  });

  const userId = session?.user?.id;

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
          <Link href={sectionHref("/trades/new", { currentSection: "trade" })}>
            New Trade
          </Link>
        </Button>
      </div>

      {isChecking && (
        <p className="text-xs text-muted-foreground">
          Checking objekt availability...
        </p>
      )}

      <TradeNotifications />

      {/* Active Trades section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Active Trades</h2>
        {activeLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading active trades...
          </div>
        ) : activeTrades.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {activeTrades.map((trade: ActiveTradeDTO) => {
                const isRecipient = trade.recipientUserId === userId;
                const otherUser = isRecipient
                  ? trade.initiator
                  : trade.recipient;
                const status = trade.status as TradeStatus;
                const needsAccept = isRecipient && status === "pending";

                const cardClass = cn(
                  "relative rounded-lg border p-4 space-y-2 transition-colors hover:bg-muted/30",
                  status === "completed"
                    ? "border-green-300 bg-green-500/10 dark:border-green-800"
                    : status === "pending"
                      ? "border-amber-200 bg-amber-500/15 dark:border-amber-900"
                      : status === "cancelled" || status === "disputed"
                        ? "border-destructive/40 bg-destructive/10"
                        : "border-border bg-card",
                );

                return (
                  <Link
                    key={trade.id}
                    href={sectionHref(`/active-trades/${trade.id}`, {
                      currentSection: "trade",
                    })}
                    className={cardClass}
                  >
                    <Badge
                      variant={statusVariant[status]}
                      className="absolute top-3 right-3 shrink-0"
                    >
                      {statusLabel[status]}
                    </Badge>
                    <p className="text-sm font-medium pr-20">
                      Trade #{trade.id}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      with {otherUser.cosmoNickname ?? otherUser.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(trade.updatedAt).toLocaleDateString("en-GB", {
                        timeZone: "GMT",
                      })}
                    </p>
                    {needsAccept && (
                      <Badge variant="default" className="text-xs">
                        Action Required
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </div>
            <TradePagination
              page={activePage}
              totalPages={activeTotalPages}
              total={activeTotal}
              limit={activeLimit}
              onPageChange={setActivePage}
            />
          </>
        ) : (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              No active trades.
            </CardContent>
          </Card>
        )}
      </div>

      <h2 className="text-lg font-semibold">My Trade Posts</h2>
      <ObjektFilterBar filters={filters} onChange={handleFiltersChange} />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading your trades...
        </div>
      ) : trades.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trades.map((trade: TradePostDTO) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                matchCount={matchCounts?.[trade.id]}
              />
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
            <Link
              href={sectionHref("/trades/new", { currentSection: "trade" })}
              className="text-primary hover:underline"
            >
              Create your first trade
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
