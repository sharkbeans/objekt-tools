# Objekt Trade

A peer-to-peer (P2P) trading platform for [MODHAUS](https://www.mod-haus.com/)' **[Cosmo: the Gate](https://play.google.com/store/apps/details?id=com.modhaus.cosmo)** objekts with trust-minimized trades.

**Objekt Trade is not affiliated with, endorsed by or supported by MODHAUS or its artists.**

## Overview

Cosmo only supports one-way transfers, requiring trust between traders. This platform minimizes that risk through trade matching, transfer verification, and ownership monitoring.

Cosmo account linking uses a simple status message verification flow — you set a short code (e.g. `verify-123456`) in your Cosmo profile status, and the platform reads it to confirm ownership. Your Cosmo credentials, session tokens, and account access are never requested or stored.

## Features

- Create bulletin-board style trade posts with specific objekts
- Automatic matching algorithm finds compatible trades
- Track active trades with real-time status updates
- Verify objekt transfers via external indexer APIs
- Monitor ownership to ensure offered objekts remain available
- Link Cosmo account via status message verification — no session tokens or credentials are ever collected
- Support for "any" filters (e.g., "any member", "any season")
- Trade notifications and history
- Automatic trade expiration and availability checks if objekts are unavailable for trade
- Counter-offer system: recipients can propose modified terms instead of accepting or rejecting outright

## Project

- `src/app`: Next.js app router with auth, trades, and active trade pages
- `src/components`: Reusable UI components (objekts, trades, shadcn/ui)
- `src/lib`: Core logic (auth, database, Cosmo API, trade matching, Redis)
- `drizzle`: Database migrations

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

| Variable               | Description                     |
| ---------------------- | ------------------------------- |
| `DATABASE_URL`       | Postgres connection string      |
| `REDIS_URL`          | Redis connection string         |
| `BETTER_AUTH_SECRET` | Any random 32+ character string |
| `BETTER_AUTH_URL`    | `http://localhost:3000`       |

`INDEXER_DATABASE_URL` powers objekt ownership lookups. Leave it blank locally — features that depend on it will fail gracefully.

Social login (`DISCORD_*`, `TWITTER_*`) is optional. Leave blank to disable those providers.

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

After seeding, log in with:

- **Email:** `seoyeon@local.wav`
- **Password:** `yooyeon5`

The account comes with a fake Cosmo identity (`localtest`) already linked, so trade creation and other authenticated flows work immediately.

### Resetting the Cosmo account link

If your local database has a cosmo account already linked (e.g. copied from prod), clear it:

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/objekt_trade -c "DELETE FROM cosmo_account;"
```

Then re-run the seed script to create a fresh fake one.

### Cosmo API features

Cosmo user search and objekt lookups require a valid token. Open [scripts/seed-local.ts](scripts/seed-local.ts) and fill in your tokens at the top before running the script:

```ts
const COSMO_ACCESS_TOKEN = "your-access-token";
const COSMO_REFRESH_TOKEN = "your-refresh-token";
```

The client auto-refreshes the token on 401/403 responses. If you leave the tokens blank, trade posts and active trades still work — only Cosmo search and objekt lookup will be unavailable.

## Tooling

- [Next.js 16](https://nextjs.org) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Better Auth](https://better-auth.com)
- [Tailwind CSS 4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [TanStack Query](https://tanstack.com/query)
- [Zustand](https://zustand-demo.pmnd.rs)
- [Biome](https://biomejs.dev)

## Database Schema

- **user**: Better Auth user accounts
- **cosmoAccount**: Linked Cosmo profiles (address, nickname)
- **tradePost**: User trade listings
- **tradePostHave**: Objekts offered (with serial numbers)
- **tradePostWant**: Objekts requested (supports "any" filters)
- **activeTrade**: Agreed trades between two users; `counterOfferToId` links back to the trade it countered; status includes `"countered"` for superseded offers
- **activeTradeSide**: Individual objekts being exchanged per side
- **tradeNotification**: User notifications for trade events

## Trade Flow

1. Link Cosmo account by setting a short verification code in your Cosmo status message — no login, QR code, or session token is required
2. Create trade post with specific objekts to offer and request
3. System finds users who have what you want and want what you have
4. Send a Trade Offer with matched party
5. Counterparty accepts, declines, or **counter-offers** with modified terms
6. Negotiation continues until both parties agree or one side cancels
7. Both parties transfer objekts via Cosmo app
8. System detects and verifies transfers
9. Trade completes when both sides confirmed

## Counter-Offer System

Either party can propose modified trade terms instead of accepting or rejecting outright. Counter-offers create a linked negotiation chain where each round produces a new active trade.

### How It Works

- The **recipient** of a pending trade can click "Counter-Offer" to open a modification dialog
- The dialog **pre-fills** both sides with the existing trade's objekts as a starting point
- The recipient can add/remove objekts on either side and sees a **diff view** before submitting
- On submit, the original trade is marked `"countered"` and a new `pending` trade is created, linked via `counterOfferToId`
- **Roles flip**: the original initiator becomes the new recipient and can accept, cancel, or counter back
- Each trade in the chain links to the previous via `counterOfferToId`, forming a full negotiation history viewable on the trade page

### Guard Rails

| Guard | Detail |
|---|---|
| **Chain depth limit** | Max 10 rounds per negotiation |
| **Per-pair rate limit** | Max 3 counter-offers per hour between the same two users |
| **48-hour expiry** | Pending counter-offers expire automatically |
| **Race condition protection** | Original trade status is re-verified inside the DB transaction before the counter is created |
| **Blocking trade guard** | Users with unsent objekts in an accepted trade cannot create counter-offers |
| **Recipient-only** | Only the current recipient can counter; initiators are explicitly blocked (403) |
| **Cosmo account required** | Both parties must have a linked wallet |
| **Diff summary in notification** | The notification to the other party includes a brief summary of what changed (e.g. `+Jiu A203, -SuA B105`) |

## Trade Safety Measures

Since Cosmo only supports one-way transfers, trading requires trust. This platform layers multiple safeguards to protect both parties throughout the trade lifecycle.

### Ownership Verification

- **At acceptance:** When a trade is accepted, the system snapshots current objekt ownership (`ownerAtAcceptance`) to establish a baseline for transfer detection.
- **Availability checks:** Before trades are initiated, objekt ownership is verified against the indexer to confirm the offered objekts are still held by the trader.

### Transfer Monitoring

- **Real-time polling:** The active trade page polls the `check-transfers` endpoint to detect objekt movements via the on-chain indexer.
- **Status tracking:** Each trade side progresses through `pending` → `sent` → `confirmed` as transfers are detected, giving both parties visibility into progress.
- **Transfer logs:** Every detected transfer is recorded in a `tradeTransferLog` table with timestamps, addresses, and objekt details for full audit trails.

### Pre-Accept Transfer Detection

Detects when a party sends objekts before the trade has been accepted:

- **Recipient warning:** Alerts that the sender has transferred an objekt before acceptance, and that they can still cancel the trade safely.
- **Sender warning:** Alerts that the recipient hasn't accepted yet and can cancel, meaning the sent objekt could be lost.
- **Auto-confirmation on accept:** If a recipient accepts a trade where objekts were already pre-delivered, those sides are automatically confirmed and the trade skips ahead to the appropriate status (`partial` or `completed`).

### Wrong Objekt Detection

- **Transfer-based detection:** Queries the indexer's transfer history for all objekts sent between the two trade parties since the trade was created.
- **Filters out trade objekts:** Any transferred objekt that isn't part of the agreed trade is flagged as a `[WRONG OBJEKT]` in the transfer logs.
- **Warnings for both sides:** Both the sender and recipient are warned when a wrong objekt transfer is detected.

### Unsolicited Transfer Defense

- **Belt-and-suspenders check:** During transfer verification, the system cross-references `ownerAtAcceptance` to prevent a pre-delivered objekt from being falsely counted as a legitimate post-acceptance transfer.
- **UI warnings:** Prominent alerts are shown in the trade UI when any anomalous transfer activity is detected.

## API Routes

### Trade Posts

- `GET /api/trades` - List all open trades
- `POST /api/trades` - Create new trade post
- `GET /api/trades/[id]` - Get trade details
- `GET /api/trades/[id]/matches` - Find matching trades
- `POST /api/trades/[id]/initiate` - Initiate active trade
- `POST /api/trades/[id]/check-availability` - Verify objekt availability

### Active Trades

- `GET /api/active-trades` - List user's active trades
- `GET /api/active-trades/[id]` - Get active trade details
- `POST /api/active-trades/[id]/accept` - Accept trade offer
- `POST /api/active-trades/[id]/cancel` - Cancel active trade
- `POST /api/active-trades/[id]/counter-offer` - Propose a counter-offer (recipient only)
- `POST /api/active-trades/[id]/check-transfers` - Verify transfers
- `GET /api/active-trades/history` - View completed/cancelled trades

### Cosmo Integration

- `POST /api/cosmo/generate-code` - Generate verification code
- `POST /api/cosmo/verify` - Verify Cosmo account
- `GET /api/cosmo/status` - Check verification status
- `GET /api/cosmo/search` - Search Cosmo users

### Objekts

- `GET /api/objekts/owned` - Get user's objekt inventory
- `GET /api/objekts/search` - Search objekts by collection ID

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

## Roadmap

See planning documents:

- `TRADE_OFFERS_PLAN.md` - UI/UX improvements
- `trade_plan_v2.md` - Core trading system architecture
- `trading_plan.md` - Original system design

## Credit/Acknowledgment

- Inspired by trading platforms (CSFloat)
- Built for the Cosmo community
- Uses data from Cosmo indexers

## Contributing

This is a personal project. For feature requests or bug reports, please open an issue.

## Contact

- **Discord**: @sharkbean
