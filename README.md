# objekt-trade

Trade board for Cosmo objekts (K-pop collectible cards). Users post what they have and want, and the system finds matching trades.

## Stack

- Next.js + React 19, TypeScript, Tailwind CSS v4
- shadcn/ui, TanStack Query v5, Zustand v5
- Better Auth, Drizzle ORM, PostgreSQL, Redis

## Local Development Setup

### 1. Prerequisites

- Node.js
- PostgreSQL running locally on port `5433`
- Redis running locally on port `6379`

### 2. Environment

Copy the example env file:

```bash
cp .env.local.example .env.development.local
```

Fill in `.env.development.local` with your local values. The defaults match a local Postgres on port `5433` and Redis on `6379`.

**`INDEXER_DATABASE_URL`** must be set to an external indexer database that tracks on-chain objekt ownership. This is not self-hosted — you need access to an existing indexer instance. Objekt search and inventory features (the objekt picker, trade matching) will error without it.

> **Important: do not use `.env.local`.**
> Next.js loads `.env.local` with higher priority than `.env.development.local`, so if `.env.local` exists and contains a production database URL (e.g. from `vercel env pull`), your local app will connect to production.
> If you've run `vercel env pull` and have a `.env.local`, rename or delete it:
> ```bash
> mv .env.local .env.local.bak
> ```

### 3. Install dependencies

```bash
npm install
```

### 4. Run migrations

Because `drizzle.config.ts` uses `@next/env` to load env files, it may pick up `.env.local` over `.env.development.local`. Pass the URL explicitly to be safe:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/objekt_trade?sslmode=disable" npx drizzle-kit migrate
```

> **`sslmode=disable` is required** — local Postgres doesn't have SSL, and without it the connection will time out.

### 5. Seed local data

Start the dev server first (the seed script calls the auth API):

```bash
npm run dev
```

Then in another terminal:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/objekt_trade?sslmode=disable" NODE_ENV=development npx tsx scripts/seed-local.ts
```

This creates a test user and links a fake Cosmo account so you can use the app without going through the real Cosmo verification flow.

Test credentials:
- **Email:** `seoyeon@local.wav`
- **Password:** `yooyeon5`

### 6. Resetting the Cosmo account link

If your local database has a cosmo account already linked (e.g. copied from prod), clear it:

```bash
psql postgresql://postgres:postgres@127.0.0.1:5433/objekt_trade -c "DELETE FROM cosmo_account;"
```

Then re-run the seed script to create a fresh fake one.
