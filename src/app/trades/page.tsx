"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { TradeCard } from "@/components/trades/trade-card";
import { TradeFilters, defaultFilters, type TradeFilterState } from "@/components/trades/trade-filters";

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
  return p;
}

export default function TradesPage() {
  const [filters, setFilters] = useState<TradeFilterState>(defaultFilters);
  const [page, setPage] = useState(1);

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
  const limit: number = data?.limit ?? 20;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Browse Trades</h1>
        <p className="text-muted-foreground">
          Find someone to trade Objekts with
        </p>
      </div>

      <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
        Traders self-report what they have. Always verify ownership on{" "}
        <a
          href="https://objekt.top"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          objekt.top
        </a>{" "}
        before trading.
      </p>

      <TradeFilters filters={filters} onChange={handleFiltersChange} />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading trades...
        </div>
      ) : trades.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trades.map((trade: any) => (
              <TradeCard key={trade.id} trade={trade} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-40 hover:bg-accent"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-40 hover:bg-accent"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No trades found. Be the first to post one!
        </div>
      )}
    </div>
  );
}
