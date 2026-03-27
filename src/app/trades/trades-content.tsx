"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { TradeCard } from "@/components/trades/trade-card";
import { TradePagination } from "@/components/trades/trade-pagination";
import { TradeFilters, type TradeFilterState } from "@/components/trades/trade-filters";
import { ActiveTradesBanner } from "@/components/trades/active-trades-banner";

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

function filtersFromSearchParams(params: URLSearchParams): TradeFilterState {
  return {
    search: params.get("search") ?? "",
    artist: params.getAll("artist").filter(Boolean),
    member: params.getAll("member").filter(Boolean),
    season: params.getAll("season").filter(Boolean),
    class: params.getAll("class").filter(Boolean),
    on_offline: params.getAll("on_offline").filter(Boolean),
    sort: params.get("sort") ?? "newest",
    filterMode: (params.get("filter_mode") as "haves" | "wants") ?? "haves",
  };
}

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
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<TradeFilterState>(() =>
    filtersFromSearchParams(searchParams),
  );
  const [page, setPage] = useState(() => Number(searchParams.get("page") ?? "1"));

  const handleFiltersChange = useCallback((next: TradeFilterState) => {
    setFilters(next);
    setPage(1);
  }, []);

  return (
    <>
      <ActiveTradesBanner />
      <TradeFilters filters={filters} onChange={handleFiltersChange} />
      {isMobile ? (
        <InfiniteTradesList filters={filters} />
      ) : (
        <PaginatedTradesList filters={filters} page={page} onPageChange={setPage} />
      )}
    </>
  );
}

function PaginatedTradesList({
  filters,
  page,
  onPageChange,
}: {
  filters: TradeFilterState;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["trades", filters, page],
    queryFn: async () => {
      const res = await fetch(`/api/trades?${buildParams(filters, page)}`);
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
        No trades found. Be the first to post one!
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {trades.map((trade: any) => (
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

function InfiniteTradesList({ filters }: { filters: TradeFilterState }) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["trades-infinite", filters],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await fetch(`/api/trades?${buildParams(filters, pageParam as number)}`);
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
      { rootMargin: "200px" }
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
        No trades found. Be the first to post one!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2.5">
      {allTrades.map((trade: any) => (
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
