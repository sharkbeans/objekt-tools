import { db } from "@/lib/db";
import { tradeNotification, user } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

interface NotificationRow {
  userId: string;
  message: string;
  activeTradeId?: string | null;
  tradePostId?: string | null;
}

/**
 * Insert one or more trade notifications into the DB and fire a Discord DM
 * to each recipient in the background (non-blocking, never throws).
 *
 * Drop-in replacement for:
 *   await db.insert(tradeNotification).values([...])
 */
export async function notify(rows: NotificationRow | NotificationRow[]): Promise<void> {
  const items = Array.isArray(rows) ? rows : [rows];
  if (items.length === 0) return;

  // Insert into DB synchronously — this is the source of truth
  await db.insert(tradeNotification).values(items);

  // Fire Discord DMs in the background — failures are logged but never thrown
  void sendDiscordDMs(items);
}

async function sendDiscordDMs(items: NotificationRow[]): Promise<void> {
  if (!BOT_TOKEN) return;

  // Look up discordId for all unique userIds in one query
  const uniqueUserIds = [...new Set(items.map((n) => n.userId))];
  const users = await db.query.user.findMany({
    where: inArray(user.id, uniqueUserIds),
    columns: { id: true, discordId: true },
  });
  const discordIdByUserId = new Map(
    users.filter((u) => u.discordId).map((u) => [u.id, u.discordId!])
  );

  await Promise.all(
    items.map(async (item) => {
      const discordId = discordIdByUserId.get(item.userId);
      if (!discordId) return;

      const tradeUrl = item.activeTradeId
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://objekt-trade.vercel.app"}/active-trades/${item.activeTradeId}`
        : null;

      const content = tradeUrl
        ? `${item.message}\n${tradeUrl}`
        : item.message;

      try {
        await dmUser(discordId, content);
      } catch (err) {
        // Non-fatal — site notifications already saved to DB
        console.error(`[notify] Discord DM failed for user ${item.userId}:`, err);
      }
    })
  );
}

async function dmUser(discordId: string, content: string): Promise<void> {
  // Step 1: open (or retrieve existing) DM channel
  const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordId }),
  });

  if (!channelRes.ok) {
    const body = await channelRes.text();
    throw new Error(`Failed to open DM channel: ${channelRes.status} ${body}`);
  }

  const channel = await channelRes.json() as { id: string };

  // Step 2: send the message
  const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!msgRes.ok) {
    const body = await msgRes.text();
    throw new Error(`Failed to send DM: ${msgRes.status} ${body}`);
  }
}
