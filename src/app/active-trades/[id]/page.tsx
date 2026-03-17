"use client";

import { use, useEffect, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { CopyIcon, CheckIcon, ExternalLinkIcon, SendIcon, AlertTriangleIcon } from "lucide-react";

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
  id: string;
  status: TradeStatus;
  createdAt: string;
  updatedAt: string;
  tradePostId?: string | null;
  matchedTradePostId?: string | null;
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
    side.serial != null ? `#${String(side.serial).padStart(5, "0")}` : null;
  return { name, serial };
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Copy username"
    >
      {copied ? <CheckIcon className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
    </button>
  );
}

function SideCard({ side, label }: { side: TradeSide; label: string }) {
  const { name: sideName, serial: sideSerial } = formatLabel(side);
  const profileUrl = side.user.cosmoNickname
    ? (() => {
        const base = `https://objekt.top/@${side.user.cosmoNickname}?transferable=true`;
        const parts = [
          side.member,
          side.collectionNo,
          side.serial != null ? `#${side.serial}` : null,
        ].filter(Boolean);
        return parts.length > 0
          ? `${base}&search=${encodeURIComponent(parts.join(" "))}`
          : base;
      })()
    : null;
  const displayName = side.user.cosmoNickname ?? side.user.name;
  return (
    <div className="space-y-1">
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      {profileUrl ? (
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-md border p-3 space-y-2 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div>
              <span className="text-sm font-medium flex items-center gap-2">
                <span>{sideName}</span>
                {sideSerial && <span className="text-muted-foreground font-normal">{sideSerial}</span>}
                <ExternalLinkIcon className="h-3 w-3 text-muted-foreground" />
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-xs text-muted-foreground">
                  {displayName}
                </p>
                <CopyButton text={displayName} />
              </div>
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
        </a>
      ) : (
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div>
              <span className="text-sm font-medium flex items-center gap-2">
                <span>{sideName}</span>
                {sideSerial && <span className="text-muted-foreground font-normal">{sideSerial}</span>}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-xs text-muted-foreground">
                  {displayName}
                </p>
                <CopyButton text={displayName} />
              </div>
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
      )}
    </div>
  );
}

interface TradeMessage {
  id: number;
  userId: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; image?: string | null; cosmoNickname?: string | null };
}

function TradeChat({ tradeId, userId }: { tradeId: string; userId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery<TradeMessage[]>({
    queryKey: ["trade-messages", tradeId],
    queryFn: async () => {
      const res = await fetch(`/api/active-trades/${tradeId}/messages`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = message.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/active-trades/${tradeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        toast.error("Failed to send message");
        return;
      }
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["trade-messages", tradeId] });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Chat</h3>
      <p className="text-xs text-muted-foreground">
        Only you and your trade partner can see these messages. Only the last 10 messages are kept.
      </p>
      <div
        ref={scrollRef}
        className="h-64 overflow-y-auto rounded-md border p-3 space-y-2 bg-muted/20"
      >
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            No messages yet. Say hi!
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.userId === userId;
          const displayName = msg.user.cosmoNickname ?? msg.user.name;
          return (
            <div
              key={msg.id}
              className={cn("flex flex-col gap-0.5", isMe ? "items-end" : "items-start")}
            >
              <span className="text-[10px] text-muted-foreground">{displayName}</span>
              <div
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm max-w-[80%] break-words",
                  isMe
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {msg.content}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {new Date(msg.createdAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSend} className="flex gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={!message.trim() || sending}>
          <SendIcon className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

type TransferLogEvent = "sent" | "confirmed" | "pre_accept_sent" | "pre_accept_confirmed" | "wrong_objekt" | "wrong_recipient";

interface TransferLog {
  id: number;
  event: TransferLogEvent;
  objektId: string;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  serial?: number | null;
  fromAddress: string;
  toAddress: string;
  senderUserId: string;
  recipientUserId: string;
  senderName: string;
  recipientName: string;
  detectedAt: string;
}

function TransferLogs({ tradeId }: { tradeId: string }) {
  const { data: logs = [] } = useQuery<TransferLog[]>({
    queryKey: ["trade-transfer-logs", tradeId],
    queryFn: async () => {
      const res = await fetch(`/api/active-trades/${tradeId}/transfer-logs`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30_000,
  });

  function formatObjektName(log: TransferLog) {
    const name =
      log.collectionNo && log.member
        ? `${log.member} ${log.collectionNo}`
        : log.collectionId;
    const serial =
      log.serial != null ? `#${String(log.serial).padStart(5, "0")}` : "";
    return `${name}${serial ? ` ${serial}` : ""}`;
  }

  function formatEventDescription(log: TransferLog) {
    const objekt = formatObjektName(log);
    switch (log.event) {
      case "confirmed":
        return (
          <>
            <span className="font-medium">{log.senderName}</span>
            {" sent "}
            <span className="font-medium">{objekt}</span>
            {" to "}
            <span className="font-medium">{log.recipientName}</span>
          </>
        );
      case "sent":
        return (
          <>
            <span className="font-medium">{log.senderName}</span>
            {" sent "}
            <span className="font-medium">{objekt}</span>
            {" to "}
            <span className="font-medium">{log.recipientName}</span>
            <span className="text-muted-foreground"> (in transit)</span>
          </>
        );
      case "pre_accept_confirmed":
        return (
          <>
            <span className="font-medium text-warning">[PRE-ACCEPT]</span>
            {" "}
            <span className="font-medium">{log.senderName}</span>
            {" sent "}
            <span className="font-medium">{objekt}</span>
            {" to "}
            <span className="font-medium">{log.recipientName}</span>
            <span className="text-warning"> (before trade was accepted)</span>
          </>
        );
      case "pre_accept_sent":
        return (
          <>
            <span className="font-medium text-warning">[PRE-ACCEPT]</span>
            {" "}
            <span className="font-medium">{log.senderName}</span>
            {" sent "}
            <span className="font-medium">{objekt}</span>
            <span className="text-warning"> (before trade was accepted, in transit)</span>
          </>
        );
      case "wrong_objekt":
        return (
          <>
            <span className="font-medium text-danger">[WRONG OBJEKT]</span>
            {" "}
            <span className="font-medium">{log.senderName}</span>
            {" sent "}
            <span className="font-medium">{objekt}</span>
            {" to "}
            <span className="font-medium">{log.recipientName}</span>
            <span className="text-danger"> (not part of this trade)</span>
          </>
        );
      case "wrong_recipient":
        return (
          <>
            <span className="font-medium text-danger">[WRONG RECIPIENT]</span>
            {" "}
            <span className="font-medium">{log.senderName}</span>
            {" sent "}
            <span className="font-medium">{objekt}</span>
            {" to "}
            <span className="font-mono text-[11px]">{log.toAddress}</span>
            <span className="text-danger"> (not the intended recipient)</span>
          </>
        );
      default:
        return (
          <>
            <span className="font-medium">{log.senderName}</span>
            {" → "}
            <span className="font-medium">{objekt}</span>
            {" → "}
            <span className="font-medium">{log.recipientName}</span>
          </>
        );
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Transfer Logs</h3>
      {logs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No transfers detected yet.</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Date &amp; Time</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Event</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className={cn(
                    "border-b last:border-0",
                    (log.event === "wrong_objekt" || log.event === "wrong_recipient") && "bg-red-500/10",
                    (log.event === "pre_accept_sent" || log.event === "pre_accept_confirmed") && "bg-amber-500/10",
                  )}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {new Date(log.detectedAt).toLocaleDateString("en-GB", { timeZone: "GMT" })}
                    {" "}
                    {new Date(log.detectedAt).toLocaleTimeString("en-GB", { timeZone: "GMT", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    {" GMT"}
                  </td>
                  <td className="px-3 py-2">
                    {formatEventDescription(log)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CHECK_TRANSFERS_COOLDOWN_MS = 10_000;

export default function ActiveTradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lastCheckRef = useRef<number>(0);
  const [checkCooldown, setCheckCooldown] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const { data: transferLogs = [] } = useQuery<TransferLog[]>({
    queryKey: ["trade-transfer-logs", id],
    queryFn: async () => {
      const res = await fetch(`/api/active-trades/${id}/transfer-logs`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const preAcceptLogs = transferLogs.filter(
    (l) => l.event === "pre_accept_sent" || l.event === "pre_accept_confirmed"
  );
  const suspiciousTransferLogs = transferLogs.filter(
    (l) => l.event === "wrong_objekt" || l.event === "wrong_recipient"
  );

  const terminalStatuses = ["completed", "cancelled", "disputed"];
  useEffect(() => {
    if (trade && terminalStatuses.includes(trade.status)) {
      queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
    }
  }, [trade?.status]);

  // On page focus/visibility restore, trigger a check-transfers if trade is active
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const status = queryClient.getQueryData<ActiveTrade>(["active-trade", id])?.status;
      if (!status || !["pending", "accepted", "partial"].includes(status)) return;
      runCheckTransfers(true);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [id]);

  function startCooldownDisplay() {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    const end = Date.now() + CHECK_TRANSFERS_COOLDOWN_MS;
    setCheckCooldown(Math.ceil((end - Date.now()) / 1000));
    cooldownTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((end - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(cooldownTimerRef.current!);
        cooldownTimerRef.current = null;
        setCheckCooldown(0);
      } else {
        setCheckCooldown(remaining);
      }
    }, 500);
  }

  async function runCheckTransfers(silent = false) {
    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_TRANSFERS_COOLDOWN_MS) return;
    lastCheckRef.current = now;
    startCooldownDisplay();

    const res = await fetch(`/api/active-trades/${id}/check-transfers`, { method: "POST" });
    if (!res.ok) {
      if (!silent) toast.error("Failed to check transfers");
      return;
    }
    const data = await res.json();
    if (!silent) {
      if (data.updated > 0) {
        toast.success(`${data.updated} transfer(s) detected.`);
      } else {
        toast.info("No new transfers detected yet.");
      }
    }
    queryClient.invalidateQueries({ queryKey: ["active-trade", id] });
    queryClient.invalidateQueries({ queryKey: ["trade-transfer-logs", id] });
  }

  async function handleAccept() {
    const res = await fetch(`/api/active-trades/${id}/accept`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Failed to accept trade");
      return;
    }
    const data = await res.json().catch(() => null);
    if (data?.preDeliveredCount > 0) {
      toast.success(
        `Trade accepted! ${data.preDeliveredCount} objekt(s) were already transferred and have been auto-confirmed.`,
        { duration: 6000 }
      );
    } else {
      toast.success("Trade accepted! Both parties can now send their objekts.");
    }
    queryClient.invalidateQueries({ queryKey: ["active-trade", id] });
    queryClient.invalidateQueries({ queryKey: ["trade-transfer-logs", id] });
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
    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_TRANSFERS_COOLDOWN_MS) return;
    await runCheckTransfers(false);
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
  const anyConfirmed = trade.sides.some((s) => s.status === "confirmed");
  const canCancel = isActive && !anyConfirmed;

  // Split sides into initiator's and recipient's (may be multiple per user for multi-objekt trades)
  const initiatorSides = trade.sides.filter((s) => s.userId === trade.initiatorUserId);
  const recipientSides = trade.sides.filter((s) => s.userId === trade.recipientUserId);

  const initiatorName = trade.initiator.cosmoNickname ?? trade.initiator.name;
  const recipientName = trade.recipient.cosmoNickname ?? trade.recipient.name;
  const isInitiator = trade.initiatorUserId === userId;

  // Always show "You send" on the left, partner on the right
  const leftSides = isInitiator ? initiatorSides : recipientSides;
  const rightSides = isInitiator ? recipientSides : initiatorSides;
  const leftLabel = isParticipant ? "You send" : `${initiatorName} sends`;
  const rightLabel = isParticipant
    ? `${isInitiator ? recipientName : initiatorName} sends`
    : `${recipientName} sends`;

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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Active Trade #{trade.id}
                <Badge variant={statusVariant[trade.status]}>
                  {statusLabel[trade.status]}
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
                {canCancel && (
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

          {trade.status === "pending" && isParticipant && (
            <div className="space-y-3">
              <div className="banner-warning flex items-center gap-3">
                <AlertTriangleIcon className="h-4 w-4 shrink-0 text-warning" />
                <p className="text-sm">Do not send any objekts until this trade has been accepted by both parties.</p>
              </div>

              {preAcceptLogs.length > 0 && (() => {
                const partnerName = isInitiator ? recipientName : initiatorName;
                const myPreAcceptSends = preAcceptLogs.filter((l) => l.senderUserId === userId);
                const theirPreAcceptSends = preAcceptLogs.filter((l) => l.senderUserId !== userId);
                return (
                  <>
                    {theirPreAcceptSends.length > 0 && (
                      <div className="banner-warning flex items-start gap-3">
                        <AlertTriangleIcon className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                        <div className="text-sm space-y-1">
                          <p className="font-medium text-warning-strong">{partnerName} has sent objekt(s) before the trade was accepted.</p>
                          {isRecipient ? (
                            <p className="text-muted-foreground">You are still allowed to cancel this trade. If you are happy with the trade, you may accept it and the transfer will be auto-confirmed. You may also return the objekt(s) to the sender via Cosmo.</p>
                          ) : (
                            <p className="text-muted-foreground">{partnerName} sent objekt(s) before the trade was accepted. The recipient can still cancel this trade.</p>
                          )}
                        </div>
                      </div>
                    )}
                    {myPreAcceptSends.length > 0 && (
                      <div className="banner-danger flex items-start gap-3">
                        <AlertTriangleIcon className="h-4 w-4 shrink-0 text-danger mt-0.5" />
                        <div className="text-sm space-y-1">
                          <p className="font-medium text-danger-strong">You sent objekt(s) before {partnerName} accepted.</p>
                          <p className="text-muted-foreground">{partnerName} has not accepted this trade yet. They can cancel and your objekt may be lost. Wait for acceptance before sending.</p>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {suspiciousTransferLogs.length > 0 && (
                <div className="banner-danger flex items-start gap-3">
                  <AlertTriangleIcon className="h-4 w-4 shrink-0 text-danger mt-0.5" />
                  <div className="text-sm space-y-1">
                    <p className="font-medium text-danger-strong">Suspicious transfer(s) detected!</p>
                    <p className="text-muted-foreground">One or more transfers are unsafe (wrong objekt or wrong recipient). Check the Transfer Logs below for details.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {trade.status === "pending" && isParticipant && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckTransfers}
              disabled={checkCooldown > 0}
              className="w-full"
            >
              {checkCooldown > 0 ? `Check Transfers (${checkCooldown}s)` : "Check Transfers"}
            </Button>
          )}

          <div className="flex gap-4">
            {leftSides.length > 0 && (
              <div className="flex-1 min-w-0 space-y-2">
                {leftSides.map((side, i) => (
                  <SideCard
                    key={side.id}
                    side={side}
                    label={i === 0 ? leftLabel : ""}
                  />
                ))}
              </div>
            )}
            {rightSides.length > 0 && (
              <div className="flex-1 min-w-0 space-y-2">
                {rightSides.map((side, i) => (
                  <SideCard
                    key={side.id}
                    side={side}
                    label={i === 0 ? rightLabel : ""}
                  />
                ))}
              </div>
            )}
          </div>

          {["accepted", "partial"].includes(trade.status) && isParticipant && (() => {
            const myName = isInitiator ? initiatorName : recipientName;
            const theirName = isInitiator ? recipientName : initiatorName;
            const mySides = leftSides;
            const theirSides = rightSides;
            return (
              <>
                <Separator />
                <div className="rounded-md bg-muted/50 px-4 py-3 text-sm space-y-4">
                  <p className="font-medium">Send guide</p>
                  {mySides.map((side) => {
                    const { name, serial } = formatLabel(side);
                    return (
                      <div key={side.id} className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">You ({myName}) send</p>
                        <p className="font-medium">{name}{serial && <span className="text-muted-foreground font-normal"> {serial}</span>}</p>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs text-muted-foreground">to <span className="text-foreground font-medium">{theirName}</span></p>
                          <CopyButton text={theirName} />
                        </div>
                      </div>
                    );
                  })}
                  {theirSides.map((side) => {
                    const { name, serial } = formatLabel(side);
                    return (
                      <div key={side.id} className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">{theirName} sends</p>
                        <p className="font-medium">{name}{serial && <span className="text-muted-foreground font-normal"> {serial}</span>}</p>
                        <p className="text-xs text-muted-foreground">to {myName}</p>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">Transfer on Cosmo, then click "Check Transfers" below to verify.</p>
                </div>
              </>
            );
          })()}

          {["accepted", "partial"].includes(trade.status) && isParticipant && suspiciousTransferLogs.length > 0 && (
            <div className="banner-danger flex items-start gap-3">
              <AlertTriangleIcon className="h-4 w-4 shrink-0 text-danger mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-medium text-danger-strong">Suspicious transfer(s) detected!</p>
                <p className="text-muted-foreground">One or more transfers are unsafe (wrong objekt or wrong recipient). Check the Transfer Logs below for details.</p>
              </div>
            </div>
          )}

          {["accepted", "partial"].includes(trade.status) && isParticipant && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckTransfers}
              disabled={checkCooldown > 0}
              className="w-full"
            >
              {checkCooldown > 0 ? `Check Transfers (${checkCooldown}s)` : "Check Transfers"}
            </Button>
          )}

          {trade.status === "completed" && (
            <div className="banner-success flex items-center justify-between gap-3">
              <p className="text-sm">Trade complete! Both objekts have been successfully transferred.</p>
            </div>
          )}

          {isParticipant && userId && (
            <>
              <Separator />
              <TradeChat tradeId={trade.id} userId={userId} />
            </>
          )}

          {isParticipant && (
            <>
              <Separator />
              <TransferLogs tradeId={trade.id} />
            </>
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
