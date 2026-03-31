# Objekt Trade

A peer-to-peer (P2P) trading platform for [MODHAUS](https://www.mod-haus.com/)' **[Cosmo: the Gate](https://play.google.com/store/apps/details?id=com.modhaus.cosmo)** objekts with trust-minimized trades.

**Objekt Trade is not affiliated with, endorsed by or supported by MODHAUS or its artists.**

## Overview

Cosmo only supports one-way transfers, requiring trust between traders. This platform minimizes that risk through trade matching, transfer verification, and ownership monitoring.

Cosmo account linking uses a simple status message verification flow — you set a short code (e.g. `verify-123456`) in your Cosmo profile status, and the platform reads it to confirm ownership. Your Cosmo credentials, session tokens, and account access are never requested or stored.

## Features

- Create posts style trade posts with specific objekts
- Automatic matching algorithm finds compatible trades
- Track active trades with real-time status updates via Pusher
- Verify objekt transfers via external indexer APIs
- Monitor ownership to ensure offered objekts remain available
- Link Cosmo account via status message verification — no session tokens or credentials are ever collected
- Support for "any" filters (e.g., "any member", "any season")
- Trade notifications: bell with unread count, dedicated `/notifications` page, and notifications for offers, messages, and counter-offers with optional Discord DMs
- Automatic trade expiration and availability checks if objekts are unavailable for trade
- Counter-offer system: recipients can propose modified terms instead of accepting or rejecting outright
- Edit or renew trade posts (description-only edits while trades are active; full edits and renewal when no active trades)
- Public user profiles at `/user/[nickname]` with completed, cancelled, and defaulted trade stats
- Trade ban system: automatic bans on trade default, auto-lifted when obligations are fulfilled
- **Paste-to-trade importer**: Bulk-add objekts from clipboard using community paste formats (no manual selection needed)

## Tooling

- [Next.js 16](https://nextjs.org)
- [TypeScript](https://www.typescriptlang.org/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Better Auth](https://better-auth.com)
- [Tailwind CSS 4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [TanStack Query](https://tanstack.com/query)
- [Zustand](https://zustand-demo.pmnd.rs)
- [Biome](https://biomejs.dev)

## Local Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- PostgreSQL and Redis running locally

**On Debian/Ubuntu/Mint:**

```bash
sudo apt install postgresql redis-server
sudo systemctl start postgresql redis-server
sudo systemctl enable postgresql redis-server  # auto-start on boot

# Create the database
sudo -u postgres createdb objekt_trade
```

**On macOS:**

```bash
brew install postgresql redis
brew services start postgresql redis
createdb objekt_trade
```

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.development.local
```

Edit `.env.development.local` and fill in at minimum:

| Variable                       | Description                                         |
| ------------------------------ | --------------------------------------------------- |
| `DATABASE_URL`               | Postgres connection string                          |
| `REDIS_URL`                  | Redis connection string                             |
| `BETTER_AUTH_SECRET`         | Any random 32+ character string                     |
| `BETTER_AUTH_URL`            | `http://localhost:3000`                           |
| `PUSHER_APP_ID`              | Pusher app ID (real-time trade/notification events) |
| `PUSHER_KEY`                 | Pusher key                                          |
| `PUSHER_SECRET`              | Pusher secret                                       |
| `PUSHER_CLUSTER`             | Pusher cluster (e.g.`ap1`)                        |
| `NEXT_PUBLIC_PUSHER_KEY`     | Same as `PUSHER_KEY` (exposed to the browser)     |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Same as `PUSHER_CLUSTER` (exposed to the browser) |

`INDEXER_DATABASE_URL` powers objekt ownership lookups. Leave it blank locally — features that depend on it will fail gracefully.

Pusher vars are optional locally — real-time updates will be unavailable but the app falls back to polling.

Discord login and Discord DM notifications require:

| Variable                  | Description                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `DISCORD_CLIENT_ID`     | OAuth app client ID                                                                   |
| `DISCORD_CLIENT_SECRET` | OAuth app client secret                                                               |
| `DISCORD_BOT_TOKEN`     | Bot token for sending DMs                                                             |
| `DISCORD_INVITE_URL`    | Invite link shown to users so the bot can DM them (e.g.`https://discord.gg/xxxxx`)  |
| `DISCORD_GUILD_ID`      | ID of the Discord server the bot must share with users to send DMs                    |
| `NEXT_PUBLIC_APP_URL`   | Public URL used to build trade links in DMs (e.g.`https://objekt.my`) |

All six are optional locally. Leave them blank to disable Discord login and DM notifications.

> **Important: do not use `.env.local`.**
> Next.js loads `.env.local` with higher priority than `.env.development.local`, so if `.env.local` exists and contains a production database URL (e.g. from `vercel env pull`), your local app will connect to production.
> If you've run `vercel env pull` and have a `.env.local`, rename or delete it:
>
> ```bash
> mv .env.local .env.local.bak
> ```

### 3. Push the database schema

Because `drizzle.config.ts` uses `@next/env` to load env files, it may pick up `.env.local` over `.env.development.local`. Pass the URL explicitly to be safe:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/objekt_trade?sslmode=disable" npx drizzle-kit push
```

> **`sslmode=disable` is required** — local Postgres doesn't have SSL, and without it the connection will time out.

### 4. Start the dev server

```bash
npm run dev
```

The app is now running at [http://localhost:3000](http://localhost:3000).

### 5. Seed a local test user

The seed script creates a pre-linked test account so you can skip the real Cosmo verification flow.

Start the dev server first (the seed script calls the auth API), then in another terminal:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/objekt_trade?sslmode=disable" NODE_ENV=development npx tsx scripts/seed-local.ts
```

### Resetting the Cosmo account link

If your local database has a cosmo account already linked (e.g. copied from prod), clear it:

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/objekt_trade -c "DELETE FROM cosmo_account;"
```

Then re-run the seed script to create a fresh fake one.

### External dependencies

Full local functionality requires two things that aren't part of this repo:

**1. Cosmo tokens**

Cosmo user search and objekt lookups require a valid Cosmo access token and refresh token from an active Cosmo account session. Open [scripts/seed-local.ts](scripts/seed-local.ts) and fill them in at the top before running the script:

```ts
const COSMO_ACCESS_TOKEN = "your-access-token";
const COSMO_REFRESH_TOKEN = "your-refresh-token";
```

The client auto-refreshes on 401/403 responses. Without tokens, trade posts and active trades still work — only Cosmo user search and objekt lookup will be unavailable.

**2. Objekt indexer**

Global objekt ownership data (who holds which objekt, transfer history) comes from an external Cosmo indexer database, not from this app. Set `INDEXER_DATABASE_URL` in your env to point at one. Without it, ownership verification, transfer detection, and availability checks will not work — the app falls back gracefully but those features will be non-functional.

### Setting up Discord for local development

1. Create an application at [discord.com/developers/applications](https://discord.com/developers/applications)
2. Under **OAuth2**, add `http://localhost:3000/api/auth/callback/discord` as a redirect URI
3. Under **Bot**, enable the bot and copy the token
4. Add `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_INVITE_URL`, and `DISCORD_GUILD_ID` to `.env.development.local`
5. Invite the bot to a test server and ensure your test account has joined it

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run Biome linter
npm run format   # Format code with Biome
```

```bash
npx drizzle-kit generate  # Generate migration file
npx drizzle-kit push      # Apply schema to database
npx drizzle-kit studio    # Open Drizzle Studio (DB browser)
npx tsx scripts/seed-local.ts  # Seed local test user
```

## Credit/Acknowledgment

- Inspired by trading platforms (CSFloat)
- Built for the Cosmo community
- Uses data from Cosmo indexers

## Contributing

This is a personal project. For feature requests or bug reports, please open an issue.

## Contact

- **Discord**: @sharkbean
