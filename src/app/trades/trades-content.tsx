"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ObjektFilterBar,
  type ObjektFilterState,
} from "@/components/objekt/objekt-filter-bar";
import { ActiveTradesBanner } from "@/components/trades/active-trades-banner";
import { TradeCard } from "@/components/trades/trade-card";
import { TradePagination } from "@/components/trades/trade-pagination";
import { Badge } from "@/components/ui/badge";
import { useObjektFilterParams } from "@/hooks/use-objekt-filter-params";
import { serializeFilterParams } from "@/lib/objekt-filters";
import type { TradePostDTO } from "@/lib/trade-types";

function formatUserFilterLabel(user: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(user)) {
    return `${user.slice(0, 6)}…${user.slice(-4)}`;
  }
  return `@${user}`;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-[72px] rounded bg-muted animate-pulse shrink-0" />
      <div className="space-y-1.5">
        <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
        <div className="h-3 w-14 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

function TradeCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
        <div className="h-3 w-12 rounded bg-muted animate-pulse" />
      </div>
      {/* HAVE → WANT */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <div className="h-2.5 w-10 rounded bg-muted animate-pulse" />
          <SkeletonRow />
          <SkeletonRow />
        </div>
        <div className="flex items-center shrink-0 px-0.5">
          <div className="w-3.5 h-3.5 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="h-2.5 w-10 rounded bg-muted animate-pulse" />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export function TradesContent() {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useObjektFilterParams();
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [userFilter, setUserFilter] = useQueryState(
    "user",
    parseAsString.withDefault(""),
  );

  const handleFiltersChange = useCallback(
    (next: ObjektFilterState) => {
      setFilters(next);
      setPage(1);
    },
    [setFilters, setPage],
  );

  const clearUserFilter = useCallback(() => {
    setUserFilter("");
    setPage(1);
  }, [setUserFilter, setPage]);

  return (
    <>
      <ActiveTradesBanner />
      <ObjektFilterBar filters={filters} onChange={handleFiltersChange} />
      {userFilter && (
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="gap-1 text-xs">
            Posts by {formatUserFilterLabel(userFilter)}
            <button type="button" onClick={clearUserFilter}>
              <XIcon className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}
      {isMobile ? (
        <InfiniteTradesList filters={filters} user={userFilter} />
      ) : (
        <PaginatedTradesList
          filters={filters}
          page={page}
          onPageChange={setPage}
          user={userFilter}
        />
      )}
    </>
  );
}

function PaginatedTradesList({
  filters,
  page,
  onPageChange,
  user,
}: {
  filters: ObjektFilterState;
  page: number;
  onPageChange: (p: number) => void;
  user: string;
}) {
  const params = serializeFilterParams(filters, { page, user }).toString();
  const { data, isLoading } = useQuery({
    queryKey: ["trades", params],
    queryFn: async () => {
      const res = await fetch(`/api/trades?${params}`);
      return res.json();
    },
  });

  const trades = data?.trades ?? [];
  const total: number = data?.total ?? 0;
  const limit: number = data?.limit ?? 12;
  const totalPages = Math.ceil(total / limit);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <TradeCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {user
          ? "No open trade posts from this user."
          : "No trades found. Be the first to post one!"}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {trades.map((trade: TradePostDTO) => (
          <TradeCard key={trade.id} trade={trade} />
        ))}
      </div>
      <TradePagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={onPageChange}
      />
    </>
  );
}

function InfiniteTradesList({
  filters,
  user,
}: {
  filters: ObjektFilterState;
  user: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const baseParams = serializeFilterParams(filters, { user }).toString();

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: ["trades-infinite", baseParams],
      queryFn: async ({ pageParam = 1 }) => {
        const res = await fetch(
          `/api/trades?${baseParams}&page=${pageParam as number}`,
        );
        return res.json();
      },
      initialPageParam: 1,
      getNextPageParam: (lastPage) => {
        const { page, limit, total } = lastPage;
        const totalPages = Math.ceil(total / limit);
        return page < totalPages ? page + 1 : undefined;
      },
    });

  // IntersectionObserver — fire fetchNextPage when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allTrades = data?.pages.flatMap((p) => p.trades) ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <TradeCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (allTrades.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {user
          ? "No open trade posts from this user."
          : "No trades found. Be the first to post one!"}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2.5">
      {allTrades.map((trade: TradePostDTO) => (
        <TradeCard key={trade.id} trade={trade} />
      ))}
      {/* Sentinel for IntersectionObserver */}
      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && (
        <div className="grid grid-cols-1 gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <TradeCardSkeleton key={i} />
          ))}
        </div>
      )}
      {!hasNextPage && allTrades.length > 0 && (
        <p className="text-center text-xs text-muted-foreground py-4">
          You&apos;ve seen all trades
        </p>
      )}
    </div>
  );
}
