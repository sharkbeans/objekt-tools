# Discord Integration

## Overview

Users authenticate exclusively via Discord OAuth. This gives every user a
reachable Discord identity, which the bot uses to send trade notifications
directly to their DMs.

---

## Architecture

```
User signs in with Discord OAuth
        ↓
Better Auth creates user + account rows
        ↓
databaseHooks (session create) syncs discord_id + discord_username → user row
        ↓
Any trade event calls notify() instead of db.insert(tradeNotification) directly
        ↓
notify() inserts to DB (source of truth) then fires sendDiscordDMs() in background
        ↓
Bot opens DM channel with user's discord_id → sends message with trade link
```

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `DISCORD_CLIENT_ID` | `.env` + Vercel | OAuth app client ID |
| `DISCORD_CLIENT_SECRET` | `.env` + Vercel | OAuth app client secret |
| `DISCORD_BOT_TOKEN` | `.env` + Vercel | Bot token for sending DMs |

The OAuth app and bot live in the **same Discord application** in the Developer Portal.

---

## Discord Developer Portal Setup

**Application:** discord.com/developers/applications

### OAuth2 tab
- Redirect URIs:
  - `http://localhost:3000/api/auth/callback/discord`
  - `https://objekt.my/api/auth/callback/discord`
- Scopes used by Better Auth: `identify email`

### Bot tab
- Bot is enabled on the same application
- Required permission: **Send Messages** (for DMs)
- No privileged gateway intents needed

### OAuth2 URL Generator (for server invite)
- Scopes: `bot`
- Bot permissions: `Send Messages`

---

## Community Server

**Invite:** https://discord.gg/p7TqCFACsH

The bot must share a server with users before it can DM them — this is a
Discord restriction to prevent spam. Users are prompted to join via the
`DiscordBanner` component shown after sign-in.

---

## Key Files

| File | Purpose |
|---|---|
| `src/lib/auth.ts` | Discord-only auth config + `databaseHooks` that sync `discord_id` / `discord_username` to the user row on every session create |
| `src/lib/notify.ts` | Drop-in replacement for `db.insert(tradeNotification)` — inserts to DB then fires Discord DMs in the background (non-blocking, never throws) |
| `src/components/discord-banner.tsx` | Dismissible banner shown to signed-in users prompting them to join the server |
| `src/app/(auth)/sign-in/page.tsx` | Single "Continue with Discord" button — no email/password |

---

## notify() — How It Works

```ts
// Before
await db.insert(tradeNotification).values({ userId, message, activeTradeId });

// After
await notify({ userId, message, activeTradeId });
```

`notify()` in `src/lib/notify.ts`:
1. Inserts all rows into `trade_notification` (synchronous — this always happens)
2. Looks up `discord_id` for each unique `userId` in one query
3. For each user with a `discord_id`, calls the Discord API:
   - `POST /api/v10/users/@me/channels` — opens (or retrieves) DM channel
   - `POST /api/v10/channels/{id}/messages` — sends the message
4. If `activeTradeId` is present, appends the full trade URL to the message
5. Failures are logged to console but never thrown — site notifications are
   unaffected if Discord is down

`NEXT_PUBLIC_APP_URL` is used to build trade links in DMs. Set it in env:
```
NEXT_PUBLIC_APP_URL=https://objekt.my
```
Falls back to the Vercel URL if not set.

---

## User Schema

`discord_id` and `discord_username` are denormalised onto the `user` table
for fast lookups without joining `account`:

```sql
discord_id       TEXT UNIQUE  -- Discord snowflake ID (used for DMs)
discord_username TEXT         -- Display name shown on profiles + trade pages
```

Both are populated by the `databaseHooks.session.create.after` hook in
`auth.ts` on every login, so they stay current if the user changes their
Discord username.

---

## Trade Page — Discord Contact

On the active trade page (`/active-trades/[id]`), each participant sees
their partner's Discord username with a copy button, between the trade sides
and the chat. This lets them coordinate off-site without needing to know
each other's handles in advance.

If a partner hasn't logged in since the schema change their `discord_username`
will be null — the UI shows a graceful fallback message.

---

## DM Requirement: Shared Server

Discord prohibits bots from cold-DMing users they don't share a server with.

**Current solution:** Users are shown a banner to join the community server.
Once they're in the server with the bot, DMs work indefinitely.

**Future option:** Enable "User Install" in the Developer Portal
(Installation tab) so users can authorise the bot to DM them directly
without a shared server.

---

## Adding New Notification Types

Just call `notify()` anywhere a notification is needed:

```ts
import { notify } from "@/lib/notify";

await notify({
  userId: "...",
  message: "Your trade was accepted!",
  activeTradeId: "abc123",   // optional — appends trade URL to DM
  tradePostId: "xyz456",     // optional — for post-level notifications
});

// Or batch:
await notify([
  { userId: initiatorId, message: "...", activeTradeId },
  { userId: recipientId, message: "...", activeTradeId },
]);
```

No other changes needed — the Discord DM fires automatically.

---

## Testing

1. Ensure `DISCORD_BOT_TOKEN` is set in `.env.development.local`
2. Bot must be in your Discord server
3. Both test accounts must have joined the server
4. Sign out and back in to ensure `discord_id` is populated
5. Trigger any trade event (send offer, accept, cancel) — DM should arrive
6. Check server logs for `[notify] Discord DM failed` if DMs don't arrive

There is also a dev-only test endpoint at `GET /api/test-dm` (requires
`TEST_DISCORD_ID` env var set to your Discord user snowflake ID).
**Delete `src/app/api/test-dm/route.ts` before deploying to prod.**
