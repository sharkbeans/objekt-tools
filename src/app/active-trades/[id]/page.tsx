"use client";

import { use, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type SideStatus = "pending" | "sent" | "confirmed";
type TradeStatus =
  | "pending"
  | "accepted"
  | "partial"
  | "completed"
  | "cancelled"
  | "disputed";

interface TradeSide {
  id: number;
  userId: string;
  address: string;
  recipientAddress: string;
  objektId: string;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  serial?: number | null;
  thumbnailUrl?: string | null;
  status: SideStatus;
  detectedAt?: string | null;
  user: { id: string; name: string; image?: string | null; cosmoNickname?: string | null };
}

interface ActiveTrade {
  id: number;
  status: TradeStatus;
  createdAt: string;
  updatedAt: string;
  tradePostId?: number | null;
  matchedTradePostId?: number | null;
  initiatorUserId: string;
  recipientUserId: string;
  initiator: { id: string; name: string; image?: string | null; cosmoNickname?: string | null };
  recipient: { id: string; name: string; image?: string | null; cosmoNickname?: string | null };
  sides: TradeSide[];
}

function formatLabel(side: TradeSide) {
  const name =
    side.collectionNo && side.member
      ? `${side.member} ${side.collectionNo}`
      : side.collectionId;
  const serial =
    side.serial != null ? ` #${String(side.serial).padStart(5, "0")}` : "";
  return name + serial;
}

const STEPS: { label: string; statuses: TradeStatus[] }[] = [
  { label: "Agreed", statuses: ["pending"] },
  { label: "Accepted", statuses: ["accepted", "partial"] },
  { label: "Transfers Sent", statuses: ["partial"] },
  { label: "Complete", statuses: ["completed"] },
];

function currentStepIndex(status: TradeStatus): number {
  if (status === "completed") return 3;
  if (status === "partial") return 2;
  if (status === "accepted") return 1;
  return 0;
}

function ProgressStepper({ status }: { status: TradeStatus }) {
  const active = currentStepIndex(status);
  return (
    <div className="flex items-center gap-0 w-full">
      {STEPS.map((step, i) => (
        <div key={step.label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors",
                i <= active
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted-foreground/30 text-muted-foreground"
              )}
            >
              {i < active ? "✓" : i + 1}
            </div>
            <span
              className={cn(
                "text-[10px] text-center leading-tight whitespace-nowrap",
                i <= active ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "h-0.5 flex-1 mx-1 mt-[-12px] transition-colors",
                i < active ? "bg-primary" : "bg-muted-foreground/20"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const sideStatusVariant: Record<SideStatus, "default" | "secondary" | "outline"> = {
  pending: "outline",
  sent: "secondary",
  confirmed: "default",
};

function SideCard({ side, label }: { side: TradeSide; label: string }) {
  const profileUrl = side.user.cosmoNickname
    ? `https://objekt.top/@${side.user.cosmoNickname}?transferable=true`
    : null;
  return (
    <div className="space-y-1">
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center gap-2">
          {side.thumbnailUrl && (
            profileUrl ? (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={side.thumbnailUrl}
                  alt={side.collectionId}
                  className="w-14 h-auto rounded hover:opacity-80 transition-opacity"
                />
              </a>
            ) : (
              <img
                src={side.thumbnailUrl}
                alt={side.collectionId}
                className="w-14 h-auto rounded"
              />
            )
          )}
          <div>
            {profileUrl ? (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline"
              >
                {formatLabel(side)}
              </a>
            ) : (
              <span className="text-sm font-medium">{formatLabel(side)}</span>
            )}
            <p className="text-xs text-muted-foreground">
              From: {side.user.cosmoNickname ?? side.user.name}
            </p>
            <p className="text-xs text-muted-foreground truncate" title={side.address}>
              {side.address.slice(0, 8)}…{side.address.slice(-6)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={sideStatusVariant[side.status]} className="text-xs capitalize">
            {side.status}
          </Badge>
          {side.detectedAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(side.detectedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ActiveTradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: trade, isLoading } = useQuery<ActiveTrade>({
    queryKey: ["active-trade", id],
    queryFn: async () => {
      const res = await fetch(`/api/active-trades/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "completed" || status === "cancelled") return false;
      return 30_000;
    },
  });

  const terminalStatuses = ["completed", "cancelled", "disputed"];
  useEffect(() => {
    if (trade && terminalStatuses.includes(trade.status)) {
      queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
    }
  }, [trade?.status]);

  async function handleAccept() {
    const res = await fetch(`/api/active-trades/${id}/accept`, { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to accept trade");
      return;
    }
    toast.success("Trade accepted! Both parties can now send their objekts.");
    queryClient.invalidateQueries({ queryKey: ["active-trade", id] });
  }

  async function handleCancel() {
    const res = await fetch(`/api/active-trades/${id}/cancel`, { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to cancel trade");
      return;
    }
    toast.success("Trade cancelled.");
    queryClient.invalidateQueries({ queryKey: ["active-trade", id] });
  }

  async function handleCheckTransfers() {
    const res = await fetch(`/api/active-trades/${id}/check-transfers`, { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to check transfers");
      return;
    }
    const data = await res.json();
    if (data.updated > 0) {
      toast.success(`${data.updated} transfer(s) detected.`);
    } else {
      toast.info("No new transfers detected yet.");
    }
    queryClient.invalidateQueries({ queryKey: ["active-trade", id] });
  }

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading...</div>
    );
  }

  if (!trade) {
    return (
      <div className="text-center py-12 text-muted-foreground">Trade not found.</div>
    );
  }

  const userId = session?.user?.id;
  const isParticipant =
    trade.initiatorUserId === userId || trade.recipientUserId === userId;
  const isRecipient = trade.recipientUserId === userId;
  const isActive = !["completed", "cancelled", "disputed"].includes(trade.status);

  // Split sides into initiator's and recipient's (may be multiple per user for multi-objekt trades)
  const initiatorSides = trade.sides.filter((s) => s.userId === trade.initiatorUserId);
  const recipientSides = trade.sides.filter((s) => s.userId === trade.recipientUserId);

  const statusVariant: Record<TradeStatus, "default" | "secondary" | "outline" | "destructive"> = {
    pending: "secondary",
    accepted: "default",
    partial: "default",
    completed: "default",
    cancelled: "destructive",
    disputed: "destructive",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Active Trade #{trade.id}
                <Badge variant={statusVariant[trade.status]} className="capitalize">
                  {trade.status}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {trade.initiator.cosmoNickname ?? trade.initiator.name} ↔ {trade.recipient.cosmoNickname ?? trade.recipient.name}
                {" · "}
                {new Date(trade.createdAt).toLocaleDateString("en-GB", { timeZone: "GMT" })}
                {" "}
                {new Date(trade.createdAt).toLocaleTimeString("en-GB", { timeZone: "GMT", hour: "2-digit", minute: "2-digit" })}
                {" GMT"}
              </CardDescription>
            </div>
            {isParticipant && (
              <div className="flex gap-2">
                {isRecipient && trade.status === "pending" && (
                  <Button size="sm" onClick={handleAccept}>
                    Accept
                  </Button>
                )}
                {isActive && (
                  <Button size="sm" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <ProgressStepper status={trade.status} />

          <Separator />

          <div className="flex gap-4">
            {initiatorSides.length > 0 && (
              <div className="flex-1 min-w-0 space-y-2">
                {initiatorSides.map((side, i) => (
                  <SideCard
                    key={side.id}
                    side={side}
                    label={i === 0 ? `${trade.initiator.cosmoNickname ?? trade.initiator.name} sends` : ""}
                  />
                ))}
              </div>
            )}
            {recipientSides.length > 0 && (
              <div className="flex-1 min-w-0 space-y-2">
                {recipientSides.map((side, i) => (
                  <SideCard
                    key={side.id}
                    side={side}
                    label={i === 0 ? `${trade.recipient.cosmoNickname ?? trade.recipient.name} sends` : ""}
                  />
                ))}
              </div>
            )}
          </div>

          {trade.status === "accepted" && (
            <>
              <Separator />
              <div className="rounded-md bg-muted/50 px-4 py-3 text-sm space-y-1">
                <p className="font-medium">Trade accepted — send your objekt now</p>
                <p className="text-muted-foreground text-xs">
                  Both parties should transfer their objekt on Cosmo. Click "Check Transfers" to verify.
                </p>
              </div>
            </>
          )}

          {["accepted", "partial"].includes(trade.status) && isParticipant && (
            <Button variant="outline" size="sm" onClick={handleCheckTransfers} className="w-full">
              Check Transfers
            </Button>
          )}

          {trade.status === "completed" && (
            <div className="rounded-md bg-primary/10 border border-primary/20 px-4 py-3 text-sm text-center">
              Trade complete! Both objekts have been successfully transferred.
            </div>
          )}

          {(trade.tradePostId || trade.matchedTradePostId) && (
            <p className="text-xs text-muted-foreground">
              Based on{" "}
              {trade.tradePostId ? (
                <>
                  <a
                    href={`/trades/${trade.tradePostId}`}
                    className="underline hover:text-foreground"
                  >
                    Trade #{trade.tradePostId}
                  </a>
                  {trade.matchedTradePostId && (
                    <>
                      {" ↔ "}
                      <a
                        href={`/trades/${trade.matchedTradePostId}`}
                        className="underline hover:text-foreground"
                      >
                        Trade #{trade.matchedTradePostId}
                      </a>
                    </>
                  )}
                </>
              ) : (
                <a
                  href={`/trades/${trade.matchedTradePostId}`}
                  className="underline hover:text-foreground"
                >
                  Trade #{trade.matchedTradePostId}
                </a>
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
