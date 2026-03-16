"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex < 2) return email;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf(".");
  const tld = dotIndex !== -1 ? domain.slice(dotIndex) : "";
  return local[0] + "*".repeat(local.length - 1) + tld;
}

type TradeStatus = "pending" | "accepted" | "partial" | "completed" | "cancelled" | "disputed";

const statusVariant: Record<TradeStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  accepted: "default",
  partial: "default",
  completed: "default",
  cancelled: "destructive",
  disputed: "destructive",
};

const statusLabel: Record<TradeStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  partial: "Ongoing",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

interface TradeHistoryEntry {
  id: number;
  status: TradeStatus;
  createdAt: string;
  updatedAt: string;
  initiatorUserId: string;
  recipientUserId: string;
  initiator: { id: string; name: string; cosmoNickname?: string | null };
  recipient: { id: string; name: string; cosmoNickname?: string | null };
  sides: {
    id: number;
    userId: string;
    thumbnailUrl?: string | null;
    collectionNo?: string | null;
    member?: string | null;
    collectionId: string;
    serial?: number | null;
  }[];
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [emailVisible, setEmailVisible] = useState(false);

  useEffect(() => {
    if (session === null) router.push("/sign-in");
  }, [session, router]);

  const { data: activeData } = useQuery({
    queryKey: ["my-active-trades"],
    queryFn: async () => {
      const res = await fetch("/api/active-trades");
      return res.json();
    },
    enabled: !!session,
  });

  const { data: historyData } = useQuery({
    queryKey: ["active-trades-history"],
    queryFn: async () => {
      const res = await fetch("/api/active-trades/history");
      return res.json();
    },
    enabled: !!session,
  });

  if (!session) return null;

  const activeTrades: TradeHistoryEntry[] = activeData?.trades ?? [];
  const historyTrades: TradeHistoryEntry[] = historyData?.trades ?? [];
  const allTrades = [...activeTrades, ...historyTrades].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const userId = session.user?.id;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{session.user.name}</CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            {emailVisible ? session.user.email : maskEmail(session.user.email)}
            <button onClick={() => setEmailVisible((v) => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
              {emailVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Cosmo Account
            </p>
            <CosmoStatus />
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-bold mb-4">Trade History</h2>
        {allTrades.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No trades yet.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Trade</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">With</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {allTrades.map((trade) => {
                  const isRecipient = trade.recipientUserId === userId;
                  const otherUser = isRecipient ? trade.initiator : trade.recipient;
                  const thumbnails = trade.sides.filter((s) => s.thumbnailUrl).slice(0, 2);
                  return (
                    <tr key={trade.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2">
                        <Link href={`/active-trades/${trade.id}`} className="hover:underline font-medium">
                          #{trade.id}
                        </Link>
                        {thumbnails.length > 0 && (
                          <span className="inline-flex gap-1 ml-2 align-middle">
                            {thumbnails.map((s) => (
                              <img key={s.id} src={s.thumbnailUrl!} alt={s.collectionId} className="w-6 h-auto rounded inline-block" />
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {otherUser.cosmoNickname ?? otherUser.name}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={statusVariant[trade.status]} className="text-xs">
                          {statusLabel[trade.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(trade.updatedAt).toLocaleDateString("en-GB", { timeZone: "GMT" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
