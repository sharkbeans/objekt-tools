"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { TradeCard } from "@/components/trades/trade-card";
import { TradeFilters, filterParsers } from "@/components/trades/trade-filters";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

export function TradesContent() {
  const [filters] = useQueryStates(filterParsers, { shallow: false });
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["trades", filters, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      for (const a of filters.artist) params.append("artist", a);
      for (const m of filters.member) params.append("member", m);
      for (const s of filters.season) params.append("season", s);
      for (const c of filters.class) params.append("class", c);
      if (filters.onOffline) params.set("onOffline", filters.onOffline);
      if (filters.sort) params.set("sort", filters.sort);
      const res = await fetch(`/api/trades?${params}`);
      return res.json();
    },
  });

  // Reset page when filters change
  const filtersKey = JSON.stringify(filters);
  const prevFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (prevFiltersKey.current !== filtersKey) {
      prevFiltersKey.current = filtersKey;
      setPage(1);
    }
  }, [filtersKey]);

  return (
    <div className="space-y-6">
      <TradeFilters />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading trades...
        </div>
      ) : data?.trades?.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.trades.map((trade: any) => (
              <TradeCard key={trade.id} trade={trade} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeftIcon className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={data.trades.length < (data.limit ?? 20)}
            >
              Next
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No trades found. Be the first to post one!
        </div>
      )}
    </div>
  );
}
