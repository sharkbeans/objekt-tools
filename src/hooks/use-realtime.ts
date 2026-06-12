"use client";

import { useQueryClient } from "@tanstack/react-query";
import Pusher, { type Channel } from "pusher-js";
import { useEffect, useRef } from "react";
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
 * Subscribes to a `trade-{tradeId}` Pusher channel.
 * On relevant events, invalidates React Query caches so the UI refreshes
 * without full polling intervals.
 *
 * Falls back silently to polling if Pusher env vars are not configured.
 */
export function useTradeRealtime(tradeId: string) {
  const queryClient = useQueryClient();
  const channelRef = useRef<Channel | null>(null);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;

    const channel = pusher.subscribe(`private-trade-${tradeId}`);
    channelRef.current = channel;

    channel.bind("trade:accepted", () => {
      queryClient.invalidateQueries({ queryKey: ["active-trade", tradeId] });
    });

    channel.bind("trade:cancelled", () => {
      queryClient.invalidateQueries({ queryKey: ["active-trade", tradeId] });
      queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
    });

    channel.bind("trade:completed", () => {
      queryClient.invalidateQueries({ queryKey: ["active-trade", tradeId] });
      queryClient.invalidateQueries({
        queryKey: ["trade-transfer-logs", tradeId],
      });
      queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
    });

    channel.bind("trade:transfer-detected", (data: { count: number }) => {
      queryClient.invalidateQueries({ queryKey: ["active-trade", tradeId] });
      queryClient.invalidateQueries({
        queryKey: ["trade-transfer-logs", tradeId],
      });
      if (data.count > 0) {
        toast.info(`${data.count} transfer(s) detected.`);
      }
    });

    channel.bind("trade:counter-offer", () => {
      queryClient.invalidateQueries({ queryKey: ["active-trade", tradeId] });
    });

    return () => {
      pusher.unsubscribe(`private-trade-${tradeId}`);
      channelRef.current = null;
    };
  }, [tradeId, queryClient]);
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
      if (data.message) {
        toast.info(data.message, { duration: 5000 });
      }
    });

    return () => {
      pusher.unsubscribe(`private-user-${userId}`);
    };
  }, [userId, queryClient]);
}
