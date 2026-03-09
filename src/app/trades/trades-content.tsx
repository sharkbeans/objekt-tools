"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { TradeCard } from "@/components/trades/trade-card";
import { TradePagination } from "@/components/trades/trade-pagination";
import { TradeFilters, defaultFilters, type TradeFilterState } from "@/components/trades/trade-filters";

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

export function TradesContent() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<TradeFilterState>(() =>
    filtersFromSearchParams(searchParams),
  );
  const [page, setPage] = useState(() => Number(searchParams.get("page") ?? "1"));

  const handleFiltersChange = useCallback((next: TradeFilterState) => {
    setFilters(next);
    setPage(1);
  }, []);

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

  return (
    <>
      <TradeFilters filters={filters} onChange={handleFiltersChange} />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading trades...</div>
      ) : trades.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trades.map((trade: any) => (
              <TradeCard key={trade.id} trade={trade} />
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
        <div className="text-center py-12 text-muted-foreground">
          No trades found. Be the first to post one!
        </div>
      )}
    </>
  );
}
