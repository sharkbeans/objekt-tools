# Objekt Trade

A peer-to-peer (P2P) trading platform for [MODHAUS](https://www.mod-haus.com/)' **[Cosmo: the Gate](https://play.google.com/store/apps/details?id=com.modhaus.cosmo)** objekts with trust-minimized trades.

**Objekt Trade is not affiliated with, endorsed by or supported by MODHAUS or its artists.**

## Overview

Cosmo only supports one-way transfers, requiring trust between traders. This platform minimizes that risk through trade matching, transfer verification, and ownership monitoring.

Cosmo account linking uses a simple status message verification flow — you set a short code (e.g. `verify-123456`) in your Cosmo profile status, and the platform reads it to confirm ownership. Your Cosmo credentials, session tokens, and account access are never requested or stored.

## Features

- Create bulletin-board style trade posts with specific objekts
- Automatic matching algorithm finds compatible trades
- Track active trades with real-time status updates via Pusher
- Verify objekt transfers via external indexer APIs
- Monitor ownership to ensure offered objekts remain available
- Link Cosmo account via status message verification — no session tokens or credentials are ever collected
- Support for "any" filters (e.g., "any member", "any season")
- Trade notifications: bell with unread count, dedicated `/notifications` page, and notifications for offers, messages, and counter-offers — with optional Discord DMs
- Automatic trade expiration and availability checks if objekts are unavailable for trade
- Counter-offer system: recipients can propose modified terms instead of accepting or rejecting outright
- Edit or renew trade posts (description-only edits while trades are active; full edits and renewal when no active trades)
- Public user profiles at `/user/[nickname]` with completed, cancelled, and defaulted trade stats
- Trade ban system: automatic bans on trade default, auto-lifted when obligations are fulfilled

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
| `NEXT_PUBLIC_APP_URL`   | Public URL used to build trade links in DMs (e.g.`https://objekt-trade.vercel.app`) |

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
- **tradePostHave**: Objekts offered (with serial numbers); `deletedAt` supports soft-delete for post editing
- **tradePostWant**: Objekts requested (supports "any" filters); `deletedAt` supports soft-delete for post editing
- **activeTrade**: Agreed trades between two users; `counterOfferToId` links back to the trade it countered; status includes `"countered"` for superseded offers; `resolvedByTradeId` points to the terminal trade in a counter-offer chain
- **activeTradeSide**: Individual objekts being exchanged per side
- **tradeNotification**: User notifications for trade events; `activeTradeId` links message and accepted-trade notifications to the relevant active trade
- **tradeBan**: Active and historical bans; linked to the offending trade; auto-lifted when obligations are fulfilled

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
- When a chain resolves (completed or cancelled), all ancestor trades gain a `resolvedByTradeId` pointing to the terminal trade — statuses are never retroactively changed

### Guard Rails

| Guard                                  | Detail                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Chain depth limit**            | Max 10 rounds per negotiation                                                                               |
| **Per-pair rate limit**          | Max 3 counter-offers per hour between the same two users                                                    |
| **48-hour expiry**               | Pending counter-offers expire automatically                                                                 |
| **Race condition protection**    | Original trade status is re-verified inside the DB transaction before the counter is created                |
| **Blocking trade guard**         | Users with unsent objekts in an accepted trade cannot create counter-offers                                 |
| **Recipient-only**               | Only the current recipient can counter; initiators are explicitly blocked (403)                             |
| **Cosmo account required**       | Both parties must have a linked wallet                                                                      |
| **Diff summary in notification** | The notification to the other party includes a brief summary of what changed (e.g.`+Jiu A203, -SuA B105`) |

## Trade Safety Measures

Since Cosmo only supports one-way transfers, trading requires trust. This platform layers multiple safeguards to protect both parties throughout the trade lifecycle.

### Ownership Verification

- **At acceptance:** When a trade is accepted, the system snapshots current objekt ownership (`ownerAtAcceptance`) to establish a baseline for transfer detection.
- **Availability checks:** Before trades are initiated, objekt ownership is verified against the indexer to confirm the offered objekts are still held by the trader.

### Transfer Monitoring

- **Real-time updates:** Active trade pages receive live updates via Pusher when transfers are detected, with polling as a fallback.
- **Status tracking:** Each trade side progresses through `pending` → `sent` → `confirmed` as transfers are detected, giving both parties visibility into progress.
- **Transfer logs:** Every detected transfer is recorded in a `tradeTransferLog` table with timestamps, addresses, and objekt details for full audit trails.

### Pre-Accept Transfer Detection

Detects when a party sends objekts before the trade has been accepted:

- **Recipient warning:** Alerts that the sender has transferred an objekt before acceptance, and that they can still cancel the trade safely.
- **Sender warning:** Alerts that the recipient hasn't accepted yet and can cancel, meaning the sent objekt could be lost.
- **Auto-confirmation on accept:** If a recipient accepts a trade where objekts were already pre-delivered, those sides are automatically confirmed and the trade skips ahead to the appropriate status (`partial` or `completed`).

**Example scenario:** User A creates a trade post. User B finds it and sends a trade offer, but User A never responds. Impatient (or confused), User B sends their objekt via Cosmo anyway — before User A has accepted anything. At this point, the trade is not agreed upon, and User A can still cancel it, leaving User B's objekt in User A's wallet with no recourse. The platform detects this early transfer and warns both sides: User B sees that their objekt is at risk because User A hasn't committed, and User A sees that User B has already sent — so they know to act (accept or cancel) rather than leave things in limbo.

### Wrong Objekt Detection

- **Transfer-based detection:** Queries the indexer's transfer history for all objekts sent between the two trade parties since the trade was created.
- **Filters out trade objekts:** Any transferred objekt that isn't part of the agreed trade is flagged as a `[WRONG OBJEKT]` in the transfer logs.
- **Warnings for both sides:** Both the sender and recipient are warned when a wrong objekt transfer is detected.

### Unsolicited Transfer Defense

- **Belt-and-suspenders check:** During transfer verification, the system cross-references `ownerAtAcceptance` to prevent a pre-delivered objekt from being falsely counted as a legitimate post-acceptance transfer.
- **UI warnings:** Prominent alerts are shown in the trade UI when any anomalous transfer activity is detected.

### Automatic Trade Expiry

- **Pending trades:** Expire after 30 days of inactivity.
- **Accepted/partial trades:** Expire after 30 days from acceptance if not completed — both parties are notified and trade posts revert to `"open"`.
- **Wrong-recipient recovery:** If a misrouted transfer is not recovered within 7 days, the trade is cancelled automatically.
- **Post status revert:** When a trade is cancelled and no other active trades (pending/accepted/partial) reference the same post, the post is automatically reverted to `"open"`.

### Trade Ban System

Automatic bans protect users from repeat defaulters:

- **When a ban is issued:** A user is banned when an accepted trade is cancelled because they failed to send their promised objekts — triggered by partner cancellation after 24 hours, or wrong-recipient expiry. For 30-day expiry, a ban is only issued if the partner had already sent their side; if both parties ghosted, no ban is issued.
- **What a ban restricts:** Banned users cannot create trade posts, initiate offers, send counter-offers, or accept trades. They can still view trades and send objekts in existing accepted trades.
- **Auto-lift:** The ban is automatically lifted once the user sends all promised objekts in the trade that triggered the ban (detected on the next `check-transfers` call). This works even if the trade was already cancelled — calling `check-transfers` on the cancelled trade checks transfer logs to confirm the user followed through.
- **Profile visibility:** Ban status is shown on the user's public profile.

### Input Validation & Rate Limiting

| Safeguard                          | Detail                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| **Status enum**              | PATCH status only accepts `"open"` or `"closed"`; `"in_trade"` is system-managed |
| **Notification batch limit** | Dismiss endpoint rejects batches of more than 100 IDs                                  |
| **Search query length**      | Objekt search queries capped at 200 characters                                         |
| **Filter array bounds**      | Objekt filter arrays (artists, members, etc.) capped at 20 items each                  |
| **Trade post creation**      | 10 requests/min per user                                                               |
| **Availability checks**      | 10 requests/min per user                                                               |
| **Cosmo user search**        | 10 requests/min per user                                                               |
| **Trade accept**             | 5 requests/min per user                                                                |
| **Chat messages**            | 1 message per 10 seconds per user                                                      |

## Login Code

Mobile Discord OAuth can be unreliable, since it redirects to the browser instead of the app, causing the flow to drop. The platform supports logging in with a short-lived code instead of going through Discord OAuth again.

### How it works

1. On an already-logged-in device (e.g. desktop), open the user menu and click **Login Code**
2. A 6-digit code is displayed with a 2-minute countdown
3. On the new device, go to the sign-in page and enter the code in the "Login with code" field
4. The new device is logged in as the same account — no Discord OAuth required

Codes are single-use and expire after 2 minutes. Signup always requires Discord OAuth; this flow is only for logging into additional devices as an existing user.

### Security

- 1,000,000 possible codes; max 5 failed attempts per IP per 10 minutes makes brute force infeasible
- Codes are deleted from Redis immediately on use (atomic `GETDEL`)
- Code generation uses `crypto.randomInt` (cryptographically secure)
- Cookie is signed with HMAC-SHA256 using `BETTER_AUTH_SECRET`, matching Better Auth's internal signing format

## Discord Integration

Authentication is Discord-only — there is no email/password login. This also gives the platform a reachable Discord identity for every user, which is used to deliver trade notifications as direct messages.

### How DM notifications work

When a trade event occurs (new offer, message, counter-offer, cancellation, etc.), a notification is saved to the database and a Discord DM is sent to the affected user in the background. DM failures are logged but never surface as errors — in-app notifications are always the source of truth.

The DM contains a direct link to the relevant trade so no context is needed from the message text alone.

### Shared server requirement

Discord prohibits bots from DMing users they don't share a server with. Users are prompted to join the community server after signing in so the bot can reach them:

**Community server:** https://discord.gg/p7TqCFACsH

### Setting up Discord for local development

1. Create an application at [discord.com/developers/applications](https://discord.com/developers/applications)
2. Under **OAuth2**, add `http://localhost:3000/api/auth/callback/discord` as a redirect URI
3. Under **Bot**, enable the bot and copy the token
4. Add `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_INVITE_URL`, and `DISCORD_GUILD_ID` to `.env.development.local`
5. Invite the bot to a test server and ensure your test account has joined it

## API Routes

### Trade Posts

- `GET /api/trades` - List all open trades
- `POST /api/trades` - Create new trade post
- `GET /api/trades/[id]` - Get trade details
- `PATCH /api/trades/[id]` - Edit trade post (description always; haves/wants only when no active trades)
- `GET /api/trades/[id]/matches` - Find matching trades
- `POST /api/trades/[id]/initiate` - Initiate active trade
- `POST /api/trades/[id]/initiate-direct` - Initiate trade directly with a specific user
- `POST /api/trades/[id]/check-availability` - Verify objekt availability
- `POST /api/trades/[id]/renew` - Reopen a closed/expired post (verifies ownership first)

### Active Trades

- `GET /api/active-trades` - List user's active trades
- `GET /api/active-trades/[id]` - Get active trade details
- `POST /api/active-trades/[id]/accept` - Accept trade offer
- `POST /api/active-trades/[id]/cancel` - Cancel active trade
- `POST /api/active-trades/[id]/counter-offer` - Propose a counter-offer (recipient only)
- `POST /api/active-trades/[id]/check-transfers` - Verify transfers
- `GET /api/active-trades/history` - View completed/cancelled trades

### Notifications

- `GET /api/trades/mine/notifications` - List notifications (paginated)
- `PATCH /api/trades/mine/notifications` - Dismiss notifications by ID

### Auth

- `POST /api/auth/login-code/generate` - Generate a 6-digit login code (requires session)
- `POST /api/auth/login-code/verify` - Redeem a login code and create a session

### Users

- `GET /api/users/[nickname]` - Public profile with trade stats (no auth required)

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

## Credit/Acknowledgment

- Inspired by trading platforms (CSFloat)
- Built for the Cosmo community
- Uses data from Cosmo indexers

## Contributing

This is a personal project. For feature requests or bug reports, please open an issue.

## Contact

- **Discord**: @sharkbean
