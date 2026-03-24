"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: number;
  message: string;
  dismissed: boolean;
  tradePostId?: string | null;
  activeTradeId?: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const { data: session, isPending } = useSession();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, error } = useQuery<{
    notifications: Notification[];
    page: number;
    limit: number;
    total: number;
  }>({
    queryKey: ["notifications-page", page],
    queryFn: async () => {
      const res = await fetch(`/api/notifications?page=${page}&limit=${limit}`);
      if (!res.ok) throw new Error("Failed to load notifications");
      return res.json();
    },
    enabled: !!session,
  });

  const { data: unreadData } = useQuery<{ count: number | string }>({
    queryKey: ["notification-unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) throw new Error("Failed to load unread notification count");
      return res.json();
    },
    enabled: !!session,
    refetchInterval: 30_000,
  });

  async function handleMarkAllRead() {
    const res = await fetch("/api/notifications", { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to mark notifications as read");
      return;
    }
    toast.success("All notifications marked as read");
    queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
    queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] });
    queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
  }

  function getNotificationLink(n: Notification): string | null {
    if (n.activeTradeId) return `/active-trades/${n.activeTradeId}`;
    if (n.tradePostId) return `/trades/${n.tradePostId}`;
    return null;
  }

  if (isPending || isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  if (!session) {
    return <div className="text-center py-12 text-muted-foreground">Sign in to view notifications.</div>;
  }

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const unreadCount = Number(unreadData?.count ?? 0);
  const hasUnread = unreadCount > 0 || notifications.some((n) => !n.dismissed);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BellIcon className="h-5 w-5" />
              Notifications
            </CardTitle>
            {hasUnread && (
              <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                <CheckCheckIcon className="h-4 w-4 mr-1.5" />
                Mark all as read
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-destructive mb-3">
              Couldn&apos;t load your notification list right now. You can still mark all as read.
            </p>
          )}
          {notifications.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No notifications yet.</p>
          ) : (
            <div className="space-y-1">
              {notifications.map((n) => {
                const link = getNotificationLink(n);
                const content = (
                  <div
                    className={cn(
                      "flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors",
                      !n.dismissed && "bg-primary/5",
                      link && "hover:bg-muted cursor-pointer",
                    )}
                  >
                    <div className="pt-1.5 shrink-0">
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full",
                          n.dismissed ? "bg-transparent" : "bg-primary",
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm">{n.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(n.createdAt).toLocaleDateString("en-GB", { timeZone: "GMT" })}
                        {" "}
                        {new Date(n.createdAt).toLocaleTimeString("en-GB", {
                          timeZone: "GMT",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" GMT"}
                      </p>
                    </div>
                    {!n.dismissed && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">New</Badge>
                    )}
                  </div>
                );

                return link ? (
                  <a key={n.id} href={link} className="block">
                    {content}
                  </a>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
