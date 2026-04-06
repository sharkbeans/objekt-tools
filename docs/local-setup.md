# Local Setup Guide

This guide is the canonical setup path for working on `objekt-trade` locally.

It covers:

- local prerequisites
- env file strategy
- required vs optional configuration
- external dependency assumptions
- staging vs production workflow
- common failure modes

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL running locally or remotely
- Redis running locally or remotely
- A Discord application for OAuth if you need to sign in normally

Example local services:

### Debian / Ubuntu / Mint

```bash
sudo apt install postgresql redis-server
sudo systemctl start postgresql redis-server
sudo systemctl enable postgresql redis-server
sudo -u postgres createdb objekt_trade
```

### macOS

```bash
brew install postgresql redis
brew services start postgresql redis
createdb objekt_trade
```

## Env File Strategy

Use separate env files for separate contexts:

- `.env.development.local`: your normal local development file
- `.env.preview.local`: values pulled from Vercel preview
- `.env.production.local`: values pulled from Vercel production

Do not use `.env.local` as a shared catch-all in this repo.

Why:

- Next.js gives `.env.local` higher priority than `.env.development.local`
- `drizzle.config.ts` loads env files through `@next/env`
- a stale `.env.local` can silently point local commands at production infrastructure

If `.env.local` already exists from an older workflow, move it out of the way:

```bash
mv .env.local .env.local.bak
```

## First-Time Local Boot

### 1. Install dependencies

```bash
npm install
```

### 2. Create your local env file

```bash
cp .env.local.example .env.development.local
```

Fill in the required values from the reference below.

### 3. Push the schema

Pass `DATABASE_URL` explicitly when running Drizzle commands so they do not accidentally pick up another env file:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/objekt_trade?sslmode=disable" npx drizzle-kit push
```

For local Postgres, keep `sslmode=disable` in the URL unless your instance is configured for SSL.

### 4. Start the app

```bash
npm run dev
```

The app should be available at `http://localhost:3000`.

### 5. Optional local seed

The seed script creates a fake linked Cosmo account and supporting rows for a test user:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/objekt_trade?sslmode=disable" NODE_ENV=development npx tsx scripts/seed-local.ts
```

Important:

- the seed helps with local data, but it does not replace the normal Discord OAuth sign-in flow
- if you want Cosmo search and objekt lookup locally, add real Cosmo tokens inside [scripts/seed-local.ts](../scripts/seed-local.ts)

## Env Reference

### Required for a normal local boot

| Variable | Required | Why |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Primary Postgres connection used by the app |
| `REDIS_URL` | Yes | Redis is used for rate limiting and short-lived auth data |
| `BETTER_AUTH_SECRET` | Yes | Required for auth/session signing |
| `BETTER_AUTH_URL` | Yes | Must match your local app origin, usually `http://localhost:3000` |
| `DISCORD_CLIENT_ID` | Yes for normal sign-in | Discord is the configured social provider |
| `DISCORD_CLIENT_SECRET` | Yes for normal sign-in | Discord OAuth secret |

### Recommended for correct local links

| Variable | Required | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Recommended | Used when the app builds trade links for notifications |

### Optional integrations

| Variable | Required | Why |
| --- | --- | --- |
| `PUSHER_APP_ID` | Optional | Enables server-side realtime publishing |
| `PUSHER_KEY` | Optional | Pusher credentials |
| `PUSHER_SECRET` | Optional | Pusher credentials |
| `PUSHER_CLUSTER` | Optional | Pusher credentials |
| `NEXT_PUBLIC_PUSHER_KEY` | Optional | Enables browser-side realtime subscriptions |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Optional | Enables browser-side realtime subscriptions |
| `DISCORD_BOT_TOKEN` | Optional | Enables Discord DM notifications |
| `INDEXER_DATABASE_URL` | Optional for basic app boot | Needed for ownership checks, objekt inventory, and transfer verification routes |
| `CRON_SECRET` | Optional locally | Only needed if you want to hit the cron route manually |

### Operational-only values

These may still matter to your team workflow, but this app does not currently read them directly at runtime:

- `DISCORD_INVITE_URL`
- `DISCORD_GUILD_ID`

## External Dependency Assumptions

### Postgres

The main application database is required. Most app features depend on it.

### Redis

Redis is required for rate limits and login-code flows. The app is not set up to run without it.

### Discord

Discord OAuth is the configured sign-in provider. For a normal local sign-in flow:

1. Create an app in the Discord developer portal.
2. Add `http://localhost:3000/api/auth/callback/discord` as a redirect URI.
3. Put the client ID and client secret into `.env.development.local`.

If you want Discord DM notifications too, create or enable a bot and set `DISCORD_BOT_TOKEN`.

### Pusher

Pusher is optional in local development. Without it:

- realtime subscriptions do not connect
- the UI falls back to normal refetch and polling behavior

### Cosmo

This app does not ask end users for their Cosmo login credentials or session tokens.

For local development, though, some flows still rely on live Cosmo API access. To test those flows locally, a developer needs valid Cosmo access and refresh tokens from their own active Cosmo session.

Those live-Cosmo-dependent flows include:

- user search
- objekt lookup
- some account-linking and inventory-related workflows

The local seed script contains placeholders for those developer-supplied tokens if you need these flows during development.

### External indexer database

`INDEXER_DATABASE_URL` points at an external indexer database that this repo does not manage.

Without it, routes that depend on global ownership and transfer data will not function correctly, including:

- objekt ownership lookups
- availability checks
- transfer verification

### Production-style staging services

For staging, assume these should be separate from production whenever possible:

- Postgres
- Redis
- Discord app / bot / callback URLs
- Pusher app

## Staging and Production Flow

This repo is now working toward a production-only `main` branch.

Expected flow:

1. Branch from `staging` for normal work.
2. Open a PR into `staging`.
3. Validate CI plus the preview or staging deployment.
4. Smoke-test against staging infrastructure.
5. Merge to `main` only when the release is ready.

Reference docs:

- [docs/staging-workflow.md](./staging-workflow.md)
- [docs/pre-deploy-checklist.md](./pre-deploy-checklist.md)

Helpful Vercel helper scripts:

```bash
npm run vercel:env:pull:preview
npm run vercel:env:pull:production
npm run vercel:build:preview
npm run vercel:build:production
```

Rules worth keeping explicit:

- never merge untested work directly into `main`
- never point preview or staging at the production database
- never rename pulled Vercel env files to `.env.local`
- never reuse production Discord callback URLs in staging

## Troubleshooting

### The app is talking to the wrong database

Most likely cause: `.env.local` is overriding `.env.development.local`.

Fix:

```bash
mv .env.local .env.local.bak
```

Then rerun your Drizzle command with an explicit `DATABASE_URL`.

### `drizzle-kit push` hangs or times out locally

For local Postgres, the connection string usually needs `?sslmode=disable`.

Example:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/objekt_trade?sslmode=disable" npx drizzle-kit push
```

### Discord login fails locally

Check all of these:

- `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are present
- `BETTER_AUTH_URL` is exactly `http://localhost:3000`
- Discord OAuth redirect URI includes `http://localhost:3000/api/auth/callback/discord`

### Realtime updates do not appear

If Pusher vars are unset, realtime is effectively disabled by design. The app should still work, but without live subscriptions.

### Objekt ownership or transfer checks fail

Those routes depend on `INDEXER_DATABASE_URL`. Local boot can work without it, but indexer-backed features cannot.

### Discord DMs are not being sent

Check:

- `DISCORD_BOT_TOKEN` is set
- the target user has a Discord ID linked in the app
- the bot can DM the user according to Discord's shared-server rules

### I need fresh local Cosmo linkage data

If you want to clear an existing local Cosmo account link:

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/objekt_trade -c "DELETE FROM cosmo_account;"
```

Then rerun the seed script.
