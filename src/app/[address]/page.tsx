"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, use, useMemo, useState } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
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

type TradeStatus =
  | "pending"
  | "accepted"
  | "partial"
  | "completed"
  | "cancelled"
  | "countered"
  | "disputed";

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
  cancelled: "Cancelled",
  countered: "Countered",
  disputed: "Disputed",
};

interface UserProfile {
  address: string;
  nickname: string | null;
  email: string | null;
  image: string | null;
  linkedAt: string;
  discordId: string | null;
  discordUsername: string | null;
  viewer: {
    isOwner: boolean;
    userId: string | null;
  };
  stats: {
    completed: number;
    cancelled: number;
    defaulted: number;
    openPosts: number;
  };
  banned: { reason: string; since: string } | null;
}

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

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: rawAddress } = use(params);
  const decoded = decodeURIComponent(rawAddress);
  const router = useRouter();

  // Profile URLs must start with @ (e.g. /@username) to avoid clashing with
  // static routes like /trades, /notifications, etc.
  if (!decoded.startsWith("@")) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-muted-foreground">
          Looking for a user profile? Try <span className="font-mono">/@username</span>
        </p>
      </div>
    );
  }

  const identifier = decoded.slice(1);
  const [emailVisible, setEmailVisible] = useState(false);

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery<UserProfile | null>({
    queryKey: ["user-profile", identifier],
    queryFn: async () => {
      const res = await fetch(`/api/users/${encodeURIComponent(identifier)}`);
      if (res.status === 301) {
        const json = await res.json();
        if (json.nickname) {
          router.replace(`/@${json.nickname}`);
          return null;
        }
        if (json.address) {
          router.replace(`/@${json.address}`);
          return null;
        }
      }
      if (!res.ok) throw new Error("User not found");
      return res.json();
    },
  });

  const isOwner = !!profile?.viewer.isOwner;

  const { data: activeData } = useQuery({
    queryKey: ["my-active-trades"],
    queryFn: async () => {
      const res = await fetch("/api/active-trades");
      return res.json();
    },
    enabled: isOwner,
  });

  const { data: historyData } = useQuery({
    queryKey: ["active-trades-history"],
    queryFn: async () => {
      const res = await fetch("/api/active-trades/history");
      return res.json();
    },
    enabled: isOwner,
  });

  const allTrades = useMemo(() => {
    if (!isOwner) return [];
    const activeTrades: TradeHistoryEntry[] = activeData?.trades ?? [];
    const historyTrades: TradeHistoryEntry[] = historyData?.trades ?? [];
    const seenIds = new Set<number>();
    return [...activeTrades, ...historyTrades]
      .filter((trade) => !seenIds.has(trade.id) && seenIds.add(trade.id))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [activeData?.trades, historyData?.trades, isOwner]);

  if (isLoading || profile === null) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h1 className="text-2xl font-bold mb-2">User not found</h1>
        <p className="text-muted-foreground">
          No user with the address &quot;{identifier}&quot; exists.
        </p>
      </div>
    );
  }

  const displayName = profile.nickname ?? profile.address;
  const viewerId = profile.viewer.userId;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-bold">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <CardTitle className="text-xl">
                {profile.nickname ? (
                  <>@{profile.nickname}</>
                ) : (
                  <span className="font-mono text-sm">{profile.address}</span>
                )}
              </CardTitle>
              <CardDescription>
                Member since{" "}
                {new Date(profile.linkedAt).toLocaleDateString("en-GB", {
                  month: "short",
                  year: "numeric",
                })}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isOwner && profile.email && (
            <div className="mb-4">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Email
              </p>
              <p className="text-sm flex items-center gap-1.5">
                {emailVisible ? profile.email : maskEmail(profile.email)}
                <button
                  type="button"
                  onClick={() => setEmailVisible((visible) => !visible)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={emailVisible ? "Hide email" : "Show email"}
                >
                  {emailVisible ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </p>
            </div>
          )}

          {profile.discordUsername && (
            <div className="mb-4">
              <p className="text-sm font-medium text-muted-foreground mb-1">Discord</p>
              {profile.discordId ? (
                <a
                  href={`https://discord.com/users/${profile.discordId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md bg-[#5865F2] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#4752C4]"
                >
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  {profile.discordUsername}
                </a>
              ) : (
                <p className="text-sm">{profile.discordUsername}</p>
              )}
            </div>
          )}

          {profile.banned && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
              <ShieldAlert className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div>
                <p className="font-medium text-destructive">Trade banned</p>
                <p className="text-muted-foreground">{profile.banned.reason}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <TooltipPrimitive.Provider delayDuration={200}>
              <StatCard
                label="Completed"
                tooltip="This user has completed trades successfully."
                value={profile.stats.completed}
                icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
              />
              <StatCard
                label="Cancelled"
                tooltip="This user has cancelled trades before completion."
                value={profile.stats.cancelled}
                icon={<XCircle className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                label="No-shows"
                tooltip="This user has had accepted trades where they did not send all required objekts in time."
                value={profile.stats.defaulted}
                icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />}
              />
              <StatCard
                label="Open Posts"
                tooltip="This user has trade posts currently open to receive offers."
                value={profile.stats.openPosts}
              />
            </TooltipPrimitive.Provider>
          </div>
        </CardContent>
      </Card>

      {profile.stats.openPosts > 0 && (
        <div className="text-center">
          <Link
            href={`/trades?user=${encodeURIComponent(profile.address)}`}
            className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
          >
            View {displayName}&apos;s trade posts
          </Link>
        </div>
      )}

      {isOwner && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Trade History</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/trades/history">View full history</Link>
            </Button>
          </div>
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
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Trade
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      With
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allTrades.map((trade) => {
                    const isRecipient =
                      viewerId !== null && trade.recipientUserId === viewerId;
                    const otherUser = isRecipient
                      ? trade.initiator
                      : trade.recipient;
                    const thumbnails = trade.sides
                      .filter((side) => side.thumbnailUrl)
                      .slice(0, 2);
                    return (
                      <tr
                        key={trade.id}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-2">
                          <Link
                            href={`/active-trades/${trade.id}`}
                            className="hover:underline font-medium"
                          >
                            #{trade.id}
                          </Link>
                          {thumbnails.length > 0 && (
                            <span className="inline-flex gap-1 ml-2 align-middle">
                              {thumbnails.map((side) => {
                                if (!side.thumbnailUrl) return null;
                                return (
                                  <Image
                                    key={side.id}
                                    src={side.thumbnailUrl}
                                    alt={side.collectionId}
                                    width={24}
                                    height={24}
                                    className="w-6 h-auto rounded inline-block"
                                  />
                                );
                              })}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {otherUser.cosmoNickname ?? otherUser.name}
                        </td>
                        <td className="px-4 py-2">
                          <Badge
                            variant={statusVariant[trade.status]}
                            className="text-xs"
                          >
                            {statusLabel[trade.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(trade.updatedAt).toLocaleDateString(
                            "en-GB",
                            {
                              timeZone: "GMT",
                            },
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  tooltip,
  value,
  icon,
}: {
  label: string;
  tooltip?: string;
  value: number;
  icon?: ReactNode;
}) {
  if (!tooltip) {
    return (
      <div className="rounded-lg border px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          {icon}
          <span className="text-2xl font-bold">{value}</span>
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    );
  }

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <div
          className="rounded-lg border px-4 py-3 text-center cursor-help"
          tabIndex={0}
          aria-label={`${label}: ${tooltip}`}
        >
          <div className="flex items-center justify-center gap-1.5 mb-1">
            {icon}
            <span className="text-2xl font-bold">{value}</span>
          </div>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <span>{label}</span>
            <Info className="h-3 w-3" />
          </p>
        </div>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="top"
          sideOffset={8}
          className="z-50 max-w-56 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
        >
          {tooltip}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
