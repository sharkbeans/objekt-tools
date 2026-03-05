"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { TradeCard } from "@/components/trades/trade-card";

export default function TradesPage() {
  const [member, setMember] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["trades", member, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (member) params.set("member", member);
      const res = await fetch(`/api/trades?${params}`);
      return res.json();
    },
  });

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

      <div className="flex gap-2">
        <Input
          placeholder="Filter by member name..."
          value={member}
          onChange={(e) => {
            setMember(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading trades...
        </div>
      ) : data?.trades?.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.trades.map((trade: any) => (
            <TradeCard key={trade.id} trade={trade} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No trades found. Be the first to post one!
        </div>
      )}
    </div>
  );
}
