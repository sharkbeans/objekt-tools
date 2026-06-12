import Pusher from "pusher";

// Server-side Pusher instance — publish events from API routes
let _pusher: Pusher | null = null;

function getPusher(): Pusher | null {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) return null;

  if (!_pusher) {
    _pusher = new Pusher({ appId, key, secret, cluster, useTLS: true });
  }
  return _pusher;
}

export function getPusherServer(): Pusher | null {
  return getPusher();
}

// Channel: `trade-{tradeId}`
// Events:
//   trade:accepted       — { activeTradeId }
//   trade:cancelled      — { activeTradeId, cancellerName }
//   trade:completed      — { activeTradeId }
//   trade:transfer-detected — { activeTradeId, count }
//   trade:counter-offer  — { activeTradeId, originalTradeId }
//   trade:offer-received — { activeTradeId, initiatorName }  (sent on trade post channel)

// Channel: `user-{userId}`
// Events:
//   notification:new     — { notificationId, message }

export async function publishTradeEvent(
  tradeId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const pusher = getPusher();
  if (!pusher) return;
  try {
    await pusher.trigger(`private-trade-${tradeId}`, event, data);
  } catch {
    // Non-fatal — realtime is best-effort
  }
}

export async function publishUserEvent(
  userId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const pusher = getPusher();
  if (!pusher) return;
  try {
    await pusher.trigger(`private-user-${userId}`, event, data);
  } catch {
    // Non-fatal — realtime is best-effort
  }
}
