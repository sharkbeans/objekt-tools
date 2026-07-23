"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ArrowUpDownIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  MessageCircleIcon,
} from "lucide-react";
import Image from "next/image";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { Fragment, use, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DiscordNudge } from "@/components/discord-nudge";
import { CounterOfferDialog } from "@/components/trades/counter-offer-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useTradeRealtime } from "@/hooks/use-realtime";
import { useSession } from "@/lib/auth-client";
import { sectionHref } from "@/lib/sections";
import type {
  ActiveTradeDTO,
  SideStatus,
  TradeSideDTO as TradeSide,
  TradeStatus,
} from "@/lib/trade-types";
import { cn } from "@/lib/utils";

interface CounterOfferChainEntry {
  id: string;
  status: string;
  initiatorUserId: string;
  recipientUserId: string;
  createdAt: string;
  initiatorName: string;
  recipientName: string;
}

interface ActiveTrade extends ActiveTradeDTO {
  counterOfferChain?: CounterOfferChainEntry[];
}

const TERMINAL_STATUSES = ["completed", "cancelled", "countered", "disputed"];

const thumbnailLookupCache = new Map<string, string | null>();

async function fetchCollectionThumbnailUrl(
  collectionId: string,
): Promise<string | null> {
  const normalizedId = collectionId.trim().toLowerCase();
  if (!normalizedId) return null;

  const cached = thumbnailLookupCache.get(normalizedId);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(
      `/api/objekts/search?q=${encodeURIComponent(collectionId)}`,
    );
    if (!res.ok) {
      thumbnailLookupCache.set(normalizedId, null);
      return null;
    }
    const data = await res.json();
    const results: Array<{
      collectionId?: string;
      thumbnailImage?: string | null;
      frontImage?: string | null;
    }> = Array.isArray(data?.results) ? data.results : [];
    const match =
      results.find(
        (r) => (r.collectionId ?? "").trim().toLowerCase() === normalizedId,
      ) ?? results[0];
    const url = match?.thumbnailImage ?? match?.frontImage ?? null;
    thumbnailLookupCache.set(normalizedId, url);
    return url;
  } catch {
    thumbnailLookupCache.set(normalizedId, null);
    return null;
  }
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
  if (["countered", "cancelled", "disputed"].includes(status)) return null;
  const active = currentStepIndex(status);
  return (
    <div className="w-full space-y-1">
      {/* Row 1: circles with flex-1 connectors between them */}
      <div className="flex items-center w-full">
        {STEPS.map((step, i) => (
          <Fragment key={step.label}>
            {i > 0 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-1.25 transition-colors",
                  i <= active ? "bg-foreground" : "bg-muted-foreground/30",
                )}
              />
            )}
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors shrink-0",
                i <= active
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted-foreground/30 text-muted-foreground",
              )}
            >
              {i < active ? "✓" : i + 1}
            </div>
          </Fragment>
        ))}
      </div>
      {/* Row 2: labels aligned under each circle via matching justify-between + w-7 */}
      <div className="flex justify-between w-full">
        {STEPS.map((step, i) => (
          <div key={step.label} className="w-7 flex justify-center">
            <span
              className={cn(
                "text-[10px] text-center leading-tight whitespace-nowrap",
                i <= active
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const sideStatusVariant: Record<
  SideStatus,
  "default" | "secondary" | "outline"
> = {
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
      {copied ? (
        <CheckIcon className="h-3 w-3" />
      ) : (
        <CopyIcon className="h-3 w-3" />
      )}
    </button>
  );
}

function ObjektThumbnail({
  src,
  collectionId,
  alt,
  href,
}: {
  src: string;
  collectionId: string;
  alt: string;
  href?: string | null;
}) {
  const normalizedInitialSrc = src.trim();
  const [resolvedSrc, setResolvedSrc] = useState(normalizedInitialSrc);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  useEffect(() => {
    setResolvedSrc(normalizedInitialSrc);
  }, [normalizedInitialSrc]);

  // Always try to resolve a canonical thumbnail by collectionId.
  // This overrides stale/placeholder URLs persisted in older trades.
  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    fetchCollectionThumbnailUrl(collectionId).then((canonicalUrl) => {
      if (cancelled || !canonicalUrl) return;
      const trimmed = canonicalUrl.trim();
      if (!trimmed) return;
      setResolvedSrc((current) => (current === trimmed ? current : trimmed));
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  useEffect(() => {
    setStatus("loading");
    if (!resolvedSrc) {
      setStatus("error");
      return;
    }

    let cancelled = false;
    const probe = new window.Image();
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setStatus((prev) => (prev === "loading" ? "error" : prev));
    }, 8000);

    const markComplete = () => {
      if (cancelled) return;
      window.clearTimeout(timeoutId);
      setStatus(probe.naturalWidth === 0 ? "error" : "loaded");
    };

    const markError = () => {
      if (cancelled) return;
      window.clearTimeout(timeoutId);
      setStatus("error");
    };

    probe.onload = markComplete;
    probe.onerror = markError;
    probe.src = resolvedSrc;

    if (probe.complete) {
      markComplete();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      probe.onload = null;
      probe.onerror = null;
    };
  }, [resolvedSrc]);

  const thumbnail = (
    <div className="w-12 aspect-[2/3] relative rounded-sm overflow-hidden">
      <Image
        src={resolvedSrc}
        alt={alt}
        fill
        unoptimized
        sizes="48px"
        onLoad={(e) =>
          setStatus(e.currentTarget.naturalWidth === 0 ? "error" : "loaded")
        }
        onError={() => setStatus("error")}
        className={cn(
          "w-full h-full object-cover",
          status !== "loaded" && "opacity-0",
        )}
      />
      {status === "loading" && (
        <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
          <span className="text-[8px] text-muted-foreground text-center leading-tight px-1">
            Loading image
          </span>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <span className="text-[8px] text-muted-foreground text-center leading-tight px-1">
            No image
          </span>
        </div>
      )}
    </div>
  );

  const trigger = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 self-start block hover:opacity-80 transition-opacity cursor-zoom-in"
    >
      {thumbnail}
    </a>
  ) : (
    <div className="shrink-0 self-start cursor-zoom-in">{thumbnail}</div>
  );

  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
        {status === "loaded" && (
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              side="left"
              sideOffset={8}
              className="z-50 rounded-md shadow-xl overflow-hidden border border-border"
            >
              {/* biome-ignore lint/performance/noImgElement: Tooltip preview uses the canonical remote card asset. */}
              <img src={resolvedSrc} alt={alt} className="w-36 h-auto block" />
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        )}
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

function SideCard({
  side,
  label,
  recipientUser,
  isYours,
}: {
  side: TradeSide;
  label: string;
  recipientUser?: { cosmoNickname?: string | null; name: string } | null;
  isYours?: boolean;
}) {
  const { name: sideName, serial: sideSerial } = formatLabel(side);
  const displayName = side.user.cosmoNickname ?? side.user.name;
  const recipientDisplayName = recipientUser
    ? (recipientUser.cosmoNickname ?? recipientUser.name)
    : null;

  // Link to sender's own Cosmo profile filtered to this objekt — lets them find it quickly to send
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

  const yourStatusText: Record<SideStatus, string> = {
    pending: "Not sent yet",
    sent: "Sent · awaiting confirmation",
    confirmed: "Confirmed",
  };
  const theirStatusText: Record<SideStatus, string> = {
    pending: "Waiting for them",
    sent: "In transit",
    confirmed: "Received",
  };
  const statusText =
    isYours === true
      ? yourStatusText[side.status]
      : isYours === false
        ? theirStatusText[side.status]
        : side.status;

  const objektLine = (
    <span className="text-sm font-medium flex items-center gap-2">
      <span>{sideName}</span>
      {sideSerial && (
        <span className="text-muted-foreground font-normal">{sideSerial}</span>
      )}
      {profileUrl && (
        <ExternalLinkIcon className="h-3 w-3 text-muted-foreground" />
      )}
    </span>
  );

  return (
    <div className="space-y-1">
      {label && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
      )}
      <div
        className={cn(
          "rounded-md border p-3",
          isYours === true &&
            side.status !== "confirmed" &&
            "border-primary/40 bg-primary/5",
          side.status === "confirmed" && "border-green-600/50 bg-green-950/40",
        )}
      >
        <div className="flex gap-3">
          <ObjektThumbnail
            src={side.thumbnailUrl ?? ""}
            collectionId={side.collectionId}
            alt={sideName}
            href={profileUrl}
          />
          <div className="flex-1 min-w-0 space-y-1.5">
            {profileUrl ? (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity block"
              >
                {objektLine}
              </a>
            ) : (
              objektLine
            )}

            {isYours === true && recipientDisplayName ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Send to</span>
                <span className="font-medium">{recipientDisplayName}</span>
                <CopyButton text={recipientDisplayName} />
              </div>
            ) : isYours === false ? (
              <p className="text-xs text-muted-foreground">
                from {displayName}
              </p>
            ) : (
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">{displayName}</p>
                <CopyButton text={displayName} />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Badge
                variant={sideStatusVariant[side.status]}
                className="text-xs"
              >
                {statusText}
              </Badge>
              {side.detectedAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(side.detectedAt).toLocaleString("en-GB", {
                    timeZone: "GMT",
                  })}{" "}
                  GMT
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscordContact({
  partnerDiscord,
  partnerDiscordId,
  partnerName,
}: {
  partnerDiscord?: string | null;
  partnerDiscordId?: string | null;
  partnerName: string;
}) {
  if (!partnerDiscord) {
    return (
      <div className="space-y-1">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <MessageCircleIcon className="h-4 w-4" /> Contact on Discord
        </h3>
        <p className="text-xs text-muted-foreground">
          {partnerName} has not linked a Discord account yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <MessageCircleIcon className="h-4 w-4" /> Contact on Discord
      </h3>
      <div className="flex items-center gap-2">
        {partnerDiscordId ? (
          <a
            href={`https://discord.com/users/${partnerDiscordId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#5865F2] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752C4]"
          >
            <svg
              className="h-4 w-4 fill-current"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Message {partnerDiscord}
          </a>
        ) : (
          <span className="text-sm font-medium">{partnerDiscord}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Reach out on Discord to coordinate your trade or confirm details.
      </p>
    </div>
  );
}

type TransferLogEvent =
  | "sent"
  | "confirmed"
  | "pre_accept_sent"
  | "pre_accept_confirmed"
  | "wrong_objekt"
  | "wrong_recipient"
  | "recovered"
  | "returned";

interface TransferLog {
  id: number;
  event: TransferLogEvent;
  activeTradeSideId: number | null;
  objektId: string;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  serial?: number | null;
  fromAddress: string;
  toAddress: string;
  toName?: string | null;
  senderUserId: string;
  recipientUserId: string;
  senderName: string;
  recipientName: string;
  detectedAt: string;
}

function TransferLogs({ tradeId }: { tradeId: string }) {
  const { data: rawLogs = [] } = useQuery<TransferLog[]>({
    queryKey: ["trade-transfer-logs", tradeId],
    queryFn: async () => {
      const res = await fetch(`/api/active-trades/${tradeId}/transfer-logs`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const logs = rawLogs.filter(
    (l) => l.event !== "sent" && l.event !== "pre_accept_sent",
  );

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
            <span className="font-medium text-warning">[PRE-ACCEPT]</span>{" "}
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
            <span className="font-medium text-warning">[PRE-ACCEPT]</span>{" "}
            <span className="font-medium">{log.senderName}</span>
            {" sent "}
            <span className="font-medium">{objekt}</span>
            <span className="text-warning">
              {" "}
              (before trade was accepted, in transit)
            </span>
          </>
        );
      case "wrong_objekt":
        return (
          <>
            <span className="font-medium text-danger">[WRONG OBJEKT]</span>{" "}
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
            <span className="font-medium text-danger">[WRONG RECIPIENT]</span>{" "}
            <span className="font-medium">{log.senderName}</span>
            {" sent "}
            <span className="font-medium">{objekt}</span>
            {" to "}
            {log.toName ? (
              <span className="font-medium">{log.toName}</span>
            ) : (
              <span className="font-mono text-[11px]">{log.toAddress}</span>
            )}
            <span className="text-danger"> (not the intended recipient)</span>
          </>
        );
      case "recovered":
        return (
          <>
            <span className="font-medium text-green-500">[RECOVERED]</span>{" "}
            <span className="font-medium">{objekt}</span>
            {" was forwarded to "}
            <span className="font-medium">{log.recipientName}</span>
            <span className="text-green-500">
              {" "}
              (objekt reached the intended recipient)
            </span>
          </>
        );
      case "returned":
        return (
          <>
            <span className="font-medium text-blue-400">[RETURNED]</span>{" "}
            <span className="font-medium">{log.senderName}</span>
            {" returned "}
            <span className="font-medium">{objekt}</span>
            {" to "}
            <span className="font-medium">{log.recipientName}</span>
            <span className="text-blue-400">
              {" "}
              (objekt returned to original sender)
            </span>
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
        <p className="text-xs text-muted-foreground">
          No transfers detected yet.
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                  Date &amp; Time
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  Event
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className={cn(
                    "border-b last:border-0",
                    (log.event === "wrong_objekt" ||
                      log.event === "wrong_recipient") &&
                      "bg-red-500/10",
                    (log.event === "pre_accept_sent" ||
                      log.event === "pre_accept_confirmed") &&
                      "bg-amber-500/10",
                    log.event === "recovered" && "bg-green-500/10",
                    log.event === "returned" && "bg-blue-500/10",
                  )}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {new Date(log.detectedAt).toLocaleDateString("en-GB", {
                      timeZone: "GMT",
                    })}{" "}
                    {new Date(log.detectedAt).toLocaleTimeString("en-GB", {
                      timeZone: "GMT",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                    {" GMT"}
                  </td>
                  <td className="px-3 py-2">{formatEventDescription(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NegotiationHistory({
  chain,
  currentTradeId,
  currentInitiatorName,
  currentRecipientName,
  currentStatus,
}: {
  chain: CounterOfferChainEntry[];
  currentTradeId: string;
  currentInitiatorName: string;
  currentRecipientName: string;
  currentStatus: TradeStatus;
}) {
  const statusColors: Record<string, string> = {
    countered: "text-blue-400",
    cancelled: "text-red-400",
    completed: "text-green-400",
    accepted: "text-green-400",
    pending: "text-yellow-400",
  };

  // Build full timeline: ancestors + current trade
  const entries = [
    ...chain.map((entry) => ({
      id: entry.id,
      label: `${entry.initiatorName} → ${entry.recipientName}`,
      status: entry.status,
      isCurrent: false,
    })),
    {
      id: currentTradeId,
      label: `${currentInitiatorName} → ${currentRecipientName}`,
      status: currentStatus,
      isCurrent: true,
    },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Negotiation History</h3>
      <div className="space-y-1">
        {entries.map((entry, i) => (
          <div key={entry.id} className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold border shrink-0",
                entry.isCurrent
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted-foreground/30 text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            {entry.isCurrent ? (
              <span className="font-medium">{entry.label}</span>
            ) : (
              <a
                href={sectionHref(`/active-trades/${entry.id}`, {
                  currentSection: "trade",
                })}
                className="hover:underline text-muted-foreground hover:text-foreground"
              >
                {entry.label}
              </a>
            )}
            <span
              className={cn(
                "capitalize",
                statusColors[entry.status] ?? "text-muted-foreground",
              )}
            >
              {entry.status}
            </span>
            {entry.isCurrent && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                current
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Expired");
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setRemaining(`${hours}h ${minutes}m`);
    }
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ClockIcon className="h-3 w-3" />
      <span>Expires in {remaining}</span>
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
  const { data: session, isPending: sessionPending } = useSession();
  const queryClient = useQueryClient();
  const lastCheckRef = useRef<number>(0);
  const [checkCooldown, setCheckCooldown] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [counterOfferOpen, setCounterOfferOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<
    "accept" | "decline" | "cancel" | null
  >(null);
  const [cancelCheckDone, setCancelCheckDone] = useState(false);
  const [cancelCheckRunning, setCancelCheckRunning] = useState(false);

  // Subscribe to realtime events — invalidates queries on trade updates, messages, etc.
  // Falls back to polling intervals below if Pusher env vars are not configured.
  useTradeRealtime(id);

  const { data: trade, isLoading } = useQuery<ActiveTrade>({
    queryKey: ["active-trade", id],
    queryFn: async () => {
      const res = await fetch(`/api/active-trades/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "completed" || status === "cancelled")
        return false;
      return 60_000; // fallback polling — realtime handles fast updates
    },
  });

  const { data: transferLogs = [] } = useQuery<TransferLog[]>({
    queryKey: ["trade-transfer-logs", id],
    queryFn: async () => {
      const res = await fetch(`/api/active-trades/${id}/transfer-logs`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60_000, // fallback polling
  });

  const preAcceptLogs = transferLogs.filter(
    (l) => l.event === "pre_accept_sent" || l.event === "pre_accept_confirmed",
  );
  const recoveredSideIds = new Set(
    transferLogs
      .filter((l) => l.event === "recovered")
      .map((l) => l.activeTradeSideId),
  );
  const returnedSideIds = new Set(
    transferLogs
      .filter((l) => l.event === "returned")
      .map((l) => l.activeTradeSideId),
  );
  const suspiciousTransferLogs = transferLogs.filter(
    (l) =>
      l.event === "wrong_objekt" ||
      (l.event === "wrong_recipient" &&
        !recoveredSideIds.has(l.activeTradeSideId)),
  );

  useEffect(() => {
    if (trade && TERMINAL_STATUSES.includes(trade.status)) {
      queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
    }
  }, [queryClient, trade]);

  const startCooldownDisplay = useCallback(() => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    const end = Date.now() + CHECK_TRANSFERS_COOLDOWN_MS;
    setCheckCooldown(Math.ceil((end - Date.now()) / 1000));
    cooldownTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((end - Date.now()) / 1000);
      if (remaining <= 0) {
        if (cooldownTimerRef.current) {
          clearInterval(cooldownTimerRef.current);
        }
        cooldownTimerRef.current = null;
        setCheckCooldown(0);
      } else {
        setCheckCooldown(remaining);
      }
    }, 500);
  }, []);

  const runCheckTransfers = useCallback(
    async (silent = false) => {
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_TRANSFERS_COOLDOWN_MS) return;
      lastCheckRef.current = now;
      startCooldownDisplay();

      const res = await fetch(`/api/active-trades/${id}/check-transfers`, {
        method: "POST",
      });
      if (!res.ok) {
        if (!silent) toast.error("Failed to check transfers");
        return;
      }
      const data = await res.json();
      if (!silent) {
        if (data.skipped) {
          toast.info("Checked just now — try again in a few seconds.");
        } else if (data.updated > 0) {
          toast.success(`${data.updated} transfer(s) detected.`);
        } else {
          toast.info("No new transfers detected yet.");
        }
      }
      queryClient.invalidateQueries({ queryKey: ["active-trade", id] });
      queryClient.invalidateQueries({ queryKey: ["trade-transfer-logs", id] });
    },
    [id, queryClient, startCooldownDisplay],
  );

  // On page focus/visibility restore, trigger a check-transfers if trade is active
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const status = queryClient.getQueryData<ActiveTrade>([
        "active-trade",
        id,
      ])?.status;
      if (!status || !["pending", "accepted", "partial"].includes(status))
        return;
      runCheckTransfers(true);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [id, queryClient, runCheckTransfers]);

  async function handleAccept() {
    const res = await fetch(`/api/active-trades/${id}/accept`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Failed to accept trade");
      return;
    }
    const data = await res.json().catch(() => null);
    if (data?.preDeliveredCount > 0) {
      toast.success(
        `Trade accepted! ${data.preDeliveredCount} objekt(s) were already transferred and have been auto-confirmed.`,
        { duration: 6000 },
      );
    } else {
      toast.success("Trade accepted! Both parties can now send their objekts.");
    }
    queryClient.invalidateQueries({ queryKey: ["active-trade", id] });
    queryClient.invalidateQueries({ queryKey: ["trade-transfer-logs", id] });
  }

  async function handleCancel() {
    const res = await fetch(`/api/active-trades/${id}/cancel`, {
      method: "POST",
    });
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

  async function openCancelDialog() {
    setCancelCheckDone(false);
    setConfirmDialog("cancel");

    // For accepted/partial trades only: run a fresh transfer check before the user can confirm.
    // This ensures the ban warning reflects the latest on-chain state.
    const currentStatus = queryClient.getQueryData<ActiveTrade>([
      "active-trade",
      id,
    ])?.status;
    if (currentStatus === "accepted" || currentStatus === "partial") {
      setCancelCheckRunning(true);
      try {
        const now = Date.now();
        // Bypass the UI cooldown — this is a dedicated safety check, not a user-initiated poll
        lastCheckRef.current = now;
        startCooldownDisplay();
        const res = await fetch(`/api/active-trades/${id}/check-transfers`, {
          method: "POST",
        });
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ["active-trade", id] });
          queryClient.invalidateQueries({
            queryKey: ["trade-transfer-logs", id],
          });
          // Wait for the query to settle so the dialog renders updated side statuses
          await queryClient.refetchQueries({ queryKey: ["active-trade", id] });
        }
      } finally {
        setCancelCheckRunning(false);
        setCancelCheckDone(true);
      }
    } else {
      // Pending trade — no transfer check needed
      setCancelCheckDone(true);
    }
  }

  if (isLoading || sessionPending) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading...</div>
    );
  }

  if (!trade) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Trade not found.
      </div>
    );
  }

  const userId = session?.user?.id;
  const isParticipant =
    trade.initiatorUserId === userId || trade.recipientUserId === userId;
  const isRecipient = trade.recipientUserId === userId;
  const isActive = ![
    "completed",
    "cancelled",
    "countered",
    "disputed",
  ].includes(trade.status);
  const mySides = trade.sides.filter((s) => s.userId === userId);
  const otherSides = trade.sides.filter((s) => s.userId !== userId);
  const myAllPending = mySides.every((s) => s.status === "pending");
  const myAllConfirmed =
    mySides.length > 0 && mySides.every((s) => s.status === "confirmed");
  const otherAllConfirmed =
    otherSides.length > 0 && otherSides.every((s) => s.status === "confirmed");
  const otherAllPending = otherSides.every((s) => s.status === "pending");

  // Path D: I sent, partner received, partner returned everything back to me.
  // Both parties can cancel cleanly — no ban for either side.
  const allMySentReturned =
    isActive &&
    myAllConfirmed &&
    mySides.length > 0 &&
    mySides.every((s) => s.status === "confirmed" && returnedSideIds.has(s.id));

  // I've sent everything but partner hasn't — waiting on them.
  // The API allows cancel after 24h (Path C), but we don't surface the button at all.
  // There is no benefit to cancelling: userA gets nothing back and userB faces no ban yet.
  // Exception: Path D — if they returned, unlock the cancel button immediately.
  const iWaitingForPartner =
    isActive && myAllConfirmed && otherAllPending && !allMySentReturned;

  // Can cancel if: nothing sent yet (Path A), partner confirmed but I haven't sent (Path B),
  // or partner returned everything to me (Path D).
  const canCancel =
    isActive &&
    !iWaitingForPartner &&
    (trade.sides.every((s) => s.status === "pending") || // Path A
      (myAllPending && otherAllConfirmed) || // Path B
      allMySentReturned); // Path D

  // Split sides into initiator's and recipient's (may be multiple per user for multi-objekt trades)
  const initiatorSides = trade.sides.filter(
    (s) => s.userId === trade.initiatorUserId,
  );
  const recipientSides = trade.sides.filter(
    (s) => s.userId === trade.recipientUserId,
  );

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

  const statusVariant: Record<
    TradeStatus,
    "default" | "secondary" | "outline" | "destructive"
  > = {
    pending: "secondary",
    accepted: "default",
    partial: "default",
    completed: "default",
    cancelled: "destructive",
    countered: "outline",
    disputed: "destructive",
  };

  const statusLabel: Record<TradeStatus, string> = {
    pending: "Pending",
    accepted: "Accepted",
    partial: "Ongoing",
    completed: "Completed",
    cancelled: trade.sides.every((s) => s.status === "pending")
      ? "Declined"
      : "Cancelled",
    countered: "Countered",
    disputed: "Disputed",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Active Trade #{trade.id}
                <Badge variant={statusVariant[trade.status]}>
                  {statusLabel[trade.status]}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {trade.initiator.cosmoNickname ?? trade.initiator.name} ↔{" "}
                {trade.recipient.cosmoNickname ?? trade.recipient.name}
                {" · "}
                {new Date(trade.createdAt).toLocaleDateString("en-GB", {
                  timeZone: "GMT",
                })}{" "}
                {new Date(trade.createdAt).toLocaleTimeString("en-GB", {
                  timeZone: "GMT",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" GMT"}
              </CardDescription>
              {trade.status === "pending" && trade.expiresAt && (
                <ExpiryCountdown expiresAt={trade.expiresAt} />
              )}
              {trade.counterOfferChain &&
                trade.counterOfferChain.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Counter-offer round {trade.counterOfferChain.length + 1}/10
                  </p>
                )}
            </div>
            {isParticipant && (
              <div className="flex flex-wrap gap-2 items-center">
                {isRecipient && trade.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white border-0"
                      onClick={() => setConfirmDialog("accept")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-700/60 text-blue-400 hover:bg-blue-900/30 hover:text-blue-300"
                      onClick={() => setCounterOfferOpen(true)}
                    >
                      Counter-Offer
                    </Button>
                  </>
                )}
                {iWaitingForPartner && (
                  <p className="text-xs text-muted-foreground">
                    Waiting for {isInitiator ? recipientName : initiatorName} to
                    send
                  </p>
                )}
                {canCancel &&
                  (trade.status === "pending" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-800/60 text-red-400 hover:bg-red-900/30 hover:text-red-300"
                      onClick={() => setConfirmDialog("decline")}
                    >
                      Decline
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={openCancelDialog}
                    >
                      Cancel
                    </Button>
                  ))}
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
                <p className="text-sm">
                  Do not send any objekts until this trade has been accepted by
                  both parties.
                </p>
              </div>

              {preAcceptLogs.length > 0 &&
                (() => {
                  const partnerName = isInitiator
                    ? recipientName
                    : initiatorName;
                  const myPreAcceptSends = preAcceptLogs.filter(
                    (l) => l.senderUserId === userId,
                  );
                  const theirPreAcceptSends = preAcceptLogs.filter(
                    (l) => l.senderUserId !== userId,
                  );
                  return (
                    <>
                      {theirPreAcceptSends.length > 0 && (
                        <div className="banner-warning flex items-start gap-3">
                          <AlertTriangleIcon className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                          <div className="text-sm space-y-1">
                            <p className="font-medium text-warning-strong">
                              {partnerName} has sent objekt(s) before the trade
                              was accepted.
                            </p>
                            {isRecipient ? (
                              <p className="text-muted-foreground">
                                You are still allowed to cancel this trade. If
                                you are happy with the trade, you may accept it
                                and the transfer will be auto-confirmed. You may
                                also return the objekt(s) to the sender via
                                Cosmo.
                              </p>
                            ) : (
                              <p className="text-muted-foreground">
                                {partnerName} sent objekt(s) before the trade
                                was accepted. The recipient can still cancel
                                this trade.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {myPreAcceptSends.length > 0 && (
                        <div className="banner-danger flex items-start gap-3">
                          <AlertTriangleIcon className="h-4 w-4 shrink-0 text-danger mt-0.5" />
                          <div className="text-sm space-y-1">
                            <p className="font-medium text-danger-strong">
                              You sent objekt(s) before {partnerName} accepted.
                            </p>
                            <p className="text-muted-foreground">
                              {partnerName} has not accepted this trade yet.
                              They can cancel and your objekt may be lost. Wait
                              for acceptance before sending.
                            </p>
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
                    <p className="font-medium text-danger-strong">
                      Suspicious transfer(s) detected!
                    </p>
                    <p className="text-muted-foreground">
                      One or more transfers are unsafe (wrong objekt or wrong
                      recipient). Check the Transfer Logs below for details.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {isParticipant ? (
            <div className="space-y-2">
              <div className="space-y-2">
                {leftSides.map((side, i) => (
                  <SideCard
                    key={`left-${side.id}`}
                    side={side}
                    label={i === 0 ? "You send" : ""}
                    recipientUser={
                      isInitiator ? trade.recipient : trade.initiator
                    }
                    isYours={true}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground py-0.5">
                <div className="flex-1 h-px bg-border" />
                <ArrowUpDownIcon className="h-6 w-6" />
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                {rightSides.map((side, i) => (
                  <SideCard
                    key={`right-${side.id}`}
                    side={side}
                    label={i === 0 ? "You receive" : ""}
                    isYours={false}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row">
              {leftSides.length > 0 && (
                <div className="flex-1 min-w-0 space-y-2">
                  {leftSides.map((side, i) => (
                    <SideCard
                      key={`left-public-${side.id}`}
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
                      key={`right-public-${side.id}`}
                      side={side}
                      label={i === 0 ? rightLabel : ""}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {allMySentReturned && isParticipant && (
            <div className="rounded-md border border-blue-500/40 bg-blue-950/30 px-4 py-3 flex items-start gap-3">
              <AlertTriangleIcon className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-medium text-blue-300">
                  {isInitiator ? recipientName : initiatorName} returned your
                  objekt(s).
                </p>
                <p className="text-muted-foreground">
                  All transferred objekts have been returned. Either party can
                  now cancel this trade without any penalties or bans.
                </p>
              </div>
            </div>
          )}

          {iWaitingForPartner && isParticipant && (
            <div className="banner-warning flex items-start gap-3">
              <AlertTriangleIcon className="h-4 w-4 shrink-0 text-warning mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-medium text-warning-strong">
                  You have sent your objekt — waiting for{" "}
                  {isInitiator ? recipientName : initiatorName} to send theirs.
                </p>
                <p className="text-muted-foreground">
                  You cannot cancel this trade yet. If{" "}
                  {isInitiator ? recipientName : initiatorName} does not send
                  within 24 hours of your transfer being detected, you will be
                  able to cancel and they will be banned. If they no longer want
                  to trade, ask them to return your objekt via Cosmo — the
                  system will detect it and unlock a penalty-free cancel.
                </p>
              </div>
            </div>
          )}

          {["accepted", "partial"].includes(trade.status) &&
            isParticipant &&
            suspiciousTransferLogs.length > 0 && (
              <div className="banner-danger flex items-start gap-3">
                <AlertTriangleIcon className="h-4 w-4 shrink-0 text-danger mt-0.5" />
                <div className="text-sm space-y-1">
                  <p className="font-medium text-danger-strong">
                    Suspicious transfer(s) detected!
                  </p>
                  <p className="text-muted-foreground">
                    One or more transfers are unsafe (wrong objekt or wrong
                    recipient). Check the Transfer Logs below for details.
                  </p>
                </div>
              </div>
            )}

          {["accepted", "partial"].includes(trade.status) && isParticipant && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                Transfer on Cosmo, then click below to verify.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckTransfers}
                disabled={checkCooldown > 0}
                className="w-full"
              >
                {checkCooldown > 0
                  ? `Check Transfers (${checkCooldown}s)`
                  : "Check Transfers"}
              </Button>
            </div>
          )}

          {trade.status === "completed" && (
            <div className="banner-success flex items-center justify-between gap-3">
              <p className="text-sm">
                Trade complete! Both objekts have been successfully transferred.
              </p>
            </div>
          )}

          {trade.status === "countered" && trade.counterOfferId && (
            <div className="space-y-4">
              <div className="rounded-md border border-blue-500/40 bg-blue-950/30 px-4 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <ArrowUpDownIcon className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-blue-300">
                      {isInitiator
                        ? `${recipientName} sent a counter-offer`
                        : "You sent a counter-offer"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isInitiator
                        ? `${recipientName} modified the trade contents and sent a new offer. This trade is now closed — view the counter-offer to accept, decline, or counter back.`
                        : "You modified the trade contents and sent a new offer. This trade is now closed — awaiting their response."}
                    </p>
                  </div>
                </div>
                <a
                  href={sectionHref(`/active-trades/${trade.counterOfferId}`, {
                    currentSection: "trade",
                  })}
                >
                  <Button
                    size="sm"
                    className="w-full bg-blue-600/80 hover:bg-blue-600 text-white"
                  >
                    View Counter-Offer
                    <ArrowRightIcon className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </a>
              </div>
              {trade.counterOfferChain &&
                trade.counterOfferChain.length > 0 && (
                  <NegotiationHistory
                    chain={trade.counterOfferChain}
                    currentTradeId={trade.id}
                    currentInitiatorName={
                      trade.initiator.cosmoNickname ?? trade.initiator.name
                    }
                    currentRecipientName={
                      trade.recipient.cosmoNickname ?? trade.recipient.name
                    }
                    currentStatus={trade.status}
                  />
                )}
            </div>
          )}

          {isParticipant && (
            <>
              <Separator />
              <DiscordNudge />
              <DiscordContact
                partnerDiscord={
                  isInitiator
                    ? trade.recipient.discordUsername
                    : trade.initiator.discordUsername
                }
                partnerDiscordId={
                  isInitiator
                    ? trade.recipient.discordId
                    : trade.initiator.discordId
                }
                partnerName={isInitiator ? recipientName : initiatorName}
              />
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
                    href={sectionHref(`/trades/${trade.tradePostId}`, {
                      currentSection: "trade",
                    })}
                    className="underline hover:text-foreground"
                  >
                    Trade #{trade.tradePostId}
                  </a>
                  {trade.matchedTradePostId && (
                    <>
                      {" ↔ "}
                      <a
                        href={sectionHref(
                          `/trades/${trade.matchedTradePostId}`,
                          { currentSection: "trade" },
                        )}
                        className="underline hover:text-foreground"
                      >
                        Trade #{trade.matchedTradePostId}
                      </a>
                    </>
                  )}
                </>
              ) : (
                <a
                  href={sectionHref(`/trades/${trade.matchedTradePostId}`, {
                    currentSection: "trade",
                  })}
                  className="underline hover:text-foreground"
                >
                  Trade #{trade.matchedTradePostId}
                </a>
              )}
            </p>
          )}
          {/* Negotiation History Chain — shown inline with countered banner above; only show here for other statuses */}
          {trade.counterOfferChain &&
            trade.counterOfferChain.length > 0 &&
            trade.status !== "countered" && (
              <>
                <Separator />
                <NegotiationHistory
                  chain={trade.counterOfferChain}
                  currentTradeId={trade.id}
                  currentInitiatorName={
                    trade.initiator.cosmoNickname ?? trade.initiator.name
                  }
                  currentRecipientName={
                    trade.recipient.cosmoNickname ?? trade.recipient.name
                  }
                  currentStatus={trade.status}
                />
              </>
            )}
        </CardContent>
      </Card>

      {/* Accept confirmation */}
      <AlertDialog
        open={confirmDialog === "accept"}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              Both parties will be committed to sending their objekts. This
              cannot be undone once accepted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                setConfirmDialog(null);
                handleAccept();
              }}
            >
              Accept trade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decline confirmation */}
      <AlertDialog
        open={confirmDialog === "decline"}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This trade will be permanently cancelled and the other party will
              be notified. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDialog(null);
                handleCancel();
              }}
            >
              Decline trade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirmation */}
      <AlertDialog
        open={confirmDialog === "cancel"}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this trade?</AlertDialogTitle>
            {cancelCheckRunning ? (
              <AlertDialogDescription>
                Checking transfer status… please wait.
              </AlertDialogDescription>
            ) : (
              (() => {
                // Re-derive from latest trade data after the check
                const freshMySides = trade.sides.filter(
                  (s) => s.userId === userId,
                );
                const freshOtherSides = trade.sides.filter(
                  (s) => s.userId !== userId,
                );
                const freshMyAllPending = freshMySides.every(
                  (s) => s.status === "pending",
                );
                const freshOtherAllConfirmed =
                  freshOtherSides.length > 0 &&
                  freshOtherSides.every((s) => s.status === "confirmed");
                const partnerName = isInitiator ? recipientName : initiatorName;

                // Path D: all my sent objekts were returned — clean cancel
                if (allMySentReturned) {
                  return (
                    <div className="space-y-3">
                      <div className="rounded-md border border-blue-500/40 bg-blue-950/30 px-4 py-3 space-y-1.5">
                        <p className="text-sm font-semibold text-blue-300">
                          Your objekt(s) were returned — no penalties will
                          apply.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold">{partnerName}</span>{" "}
                          returned all transferred objekts. Cancelling this
                          trade will not result in a ban for either party.
                        </p>
                      </div>
                    </div>
                  );
                }

                // Path B: partner confirmed, I haven't sent — I will be banned
                if (freshMyAllPending && freshOtherAllConfirmed) {
                  const sentObjekts = freshOtherSides
                    .map((s) => {
                      const { name, serial } = formatLabel(s);
                      return serial ? `${name} ${serial}` : name;
                    })
                    .join(", ");
                  return (
                    <div className="space-y-3">
                      <div className="rounded-md border border-red-600/60 bg-red-950/40 px-4 py-3 space-y-1.5">
                        <p className="text-sm font-bold text-red-400">
                          ⚠ YOU WILL BE BANNED if you cancel now.
                        </p>
                        <p className="text-sm text-red-300">
                          <span className="font-semibold">{partnerName}</span>{" "}
                          has already sent:{" "}
                          <span className="font-semibold">{sentObjekts}</span>.
                          Cancelling means you are defaulting on an agreed trade
                          — a trade ban will be issued to your account
                          automatically.
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        If you believe this is a mistake or you were pressured
                        into cancelling, do not proceed. Contact support
                        instead.
                      </p>
                    </div>
                  );
                }

                return (
                  <AlertDialogDescription>
                    Neither party has sent their objekt yet. Cancelling will
                    revert both trade posts to open. This cannot be undone.
                  </AlertDialogDescription>
                );
              })()
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!cancelCheckDone}
              onClick={() => {
                setConfirmDialog(null);
                handleCancel();
              }}
            >
              {cancelCheckRunning ? "Checking…" : "Cancel trade"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Counter-Offer Dialog */}
      {isRecipient && trade.status === "pending" && (
        <CounterOfferDialog
          open={counterOfferOpen}
          onOpenChange={setCounterOfferOpen}
          tradeId={trade.id}
          mySides={recipientSides}
          theirSides={initiatorSides}
          theirAddress={initiatorSides[0]?.address ?? ""}
          theirCosmoUsername={
            trade.initiator.cosmoNickname ?? trade.initiator.name
          }
        />
      )}
    </div>
  );
}
