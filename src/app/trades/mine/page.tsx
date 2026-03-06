"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TradeCard } from "@/components/trades/trade-card";

export default function MyTradesPage() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.push("/sign-in");
  }, [session, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-trades"],
    queryFn: async () => {
      const res = await fetch("/api/trades/mine");
      return res.json();
    },
    enabled: !!session,
  });

  const tradeIds: number[] = data?.trades?.map((t: any) => t.id) ?? [];

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

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading your trades...
        </div>
      ) : data?.trades?.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.trades.map((trade: any) => (
            <TradeCard key={trade.id} trade={trade} matchCount={matchCounts?.[trade.id]} />
          ))}
        </div>
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
