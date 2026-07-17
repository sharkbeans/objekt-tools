"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ObjektFilterBar,
  type ObjektFilterState,
} from "@/components/objekt/objekt-filter-bar";
import { ActiveTradesBanner } from "@/components/trades/active-trades-banner";
import { TradeCard } from "@/components/trades/trade-card";
import { TradePagination } from "@/components/trades/trade-pagination";
import { Badge } from "@/components/ui/badge";
import { applyTradeSearchShortcuts } from "@/lib/trade-search-shortcuts";
import type { TradePostDTO } from "@/lib/trade-types";

const PAGINATED_SKELETON_KEYS = [
  "paginated-1",
  "paginated-2",
  "paginated-3",
  "paginated-4",
  "paginated-5",
  "paginated-6",
];
const INFINITE_SKELETON_KEYS = [
  "infinite-1",
  "infinite-2",
  "infinite-3",
  "infinite-4",
];
const FETCHING_SKELETON_KEYS = ["fetching-1", "fetching-2", "fetching-3"];

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

function filtersFromSearchParams(params: URLSearchParams): ObjektFilterState {
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

function buildParams(filters: ObjektFilterState, page: number, user?: string) {
  const effective = applyTradeSearchShortcuts(filters);
  const p = new URLSearchParams();
  p.set("page", String(page));
  for (const a of effective.artist) p.append("artist", a);
  for (const m of effective.member) p.append("member", m);
  for (const s of effective.season) p.append("season", s);
  for (const c of effective.class) p.append("class", c);
  for (const o of effective.on_offline) p.append("on_offline", o);
  if (effective.search) p.set("search", effective.search);
  if (effective.sort) p.set("sort", effective.sort);
  p.set("filter_mode", effective.filterMode);
  if (user) p.set("user", user);
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
  const [filters, setFilters] = useState<ObjektFilterState>(() =>
    filtersFromSearchParams(searchParams),
  );
  const [page, setPage] = useState(() =>
    Number(searchParams.get("page") ?? "1"),
  );
  const [userFilter, setUserFilter] = useState(
    () => searchParams.get("user") ?? "",
  );

  const handleFiltersChange = useCallback((next: ObjektFilterState) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearUserFilter = useCallback(() => {
    setUserFilter("");
    setPage(1);
  }, []);

  return (
    <>
      <ActiveTradesBanner />
      <ObjektFilterBar
        filters={filters}
        onChange={handleFiltersChange}
        smartSearchMode="trade"
        searchPlaceholder="Search trades... e.g. w sy cc101"
      />
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
  const { data, isLoading } = useQuery({
    queryKey: ["trades", filters, user, page],
    queryFn: async () => {
      const res = await fetch(
        `/api/trades?${buildParams(filters, page, user)}`,
      );
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
        {PAGINATED_SKELETON_KEYS.map((key) => (
          <TradeCardSkeleton key={key} />
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

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: ["trades-infinite", filters, user],
      queryFn: async ({ pageParam = 1 }) => {
        const res = await fetch(
          `/api/trades?${buildParams(filters, pageParam as number, user)}`,
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
        {INFINITE_SKELETON_KEYS.map((key) => (
          <TradeCardSkeleton key={key} />
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
          {FETCHING_SKELETON_KEYS.map((key) => (
            <TradeCardSkeleton key={key} />
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
