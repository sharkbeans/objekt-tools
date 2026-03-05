"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TradeCard } from "@/components/trades/trade-card";

export default function ProfilePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (session === null) router.push("/sign-in");
  }, [session, router]);

  const { data: trades } = useQuery({
    queryKey: ["my-trades"],
    queryFn: async () => {
      const res = await fetch("/api/trades/mine");
      return res.json();
    },
    enabled: !!session,
  });

  const handleRenew = async (tradeId: number) => {
    await fetch(`/api/trades/${tradeId}/renew`, { method: "PATCH" });
    queryClient.invalidateQueries({ queryKey: ["my-trades"] });
  };

  if (!session) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{session.user.name}</CardTitle>
          <CardDescription>{session.user.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Cosmo Account
            </p>
            {/* We'll fetch this from a dedicated endpoint */}
            <CosmoStatus />
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">My Trades</h2>
          <Button asChild size="sm">
            <Link href="/trades/new">New Trade</Link>
          </Button>
        </div>

        {trades?.trades?.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {trades.trades.map((trade: any) => (
              <TradeCard key={trade.id} trade={trade} onRenew={handleRenew} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              You haven&apos;t posted any trades yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CosmoStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ["cosmo-link-status"],
    queryFn: async () => {
      const res = await fetch("/api/cosmo/status");
      if (res.status === 404) return null;
      return res.json();
    },
  });

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Loading...</p>;

  if (!data) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline">Not linked</Badge>
        <Button variant="link" size="sm" asChild className="px-0">
          <Link href="/link">Link your Cosmo account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="default">@{data.nickname}</Badge>
      <span className="text-xs text-muted-foreground font-mono">
        {data.address}
      </span>
    </div>
  );
}
