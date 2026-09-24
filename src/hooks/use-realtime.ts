"use client";

import { useQueryClient } from "@tanstack/react-query";
import Pusher from "pusher-js";
import { useEffect } from "react";
import { toast } from "sonner";

// Singleton Pusher client — shared across all hook instances
let _client: Pusher | null = null;

function getPusherClient(): Pusher | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) return null;
  if (!_client) {
    _client = new Pusher(key, { cluster, authEndpoint: "/api/pusher/auth" });
  }
  return _client;
}

/**
 * Subscribes to a `user-{userId}` Pusher channel for per-user notifications.
 * On `notification:new`, invalidates the unread count query and shows a toast.
 */
export function useUserRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const channel = pusher.subscribe(`private-user-${userId}`);

    channel.bind("notification:new", (data: { message: string }) => {
      queryClient.invalidateQueries({
        queryKey: ["notification-unread-count"],
      });
      queryClient.invalidateQueries({ queryKey: ["matches-count"] });
      if (data.message) {
        toast.info(data.message, { duration: 5000 });
      }
    });

    return () => {
      pusher.unsubscribe(`private-user-${userId}`);
    };
  }, [userId, queryClient]);
}
