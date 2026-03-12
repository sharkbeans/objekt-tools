# Objekt Trade

A peer-to-peer trading platform for [MODHAUS](https://www.mod-haus.com/)' **[Cosmo: the Gate](https://play.google.com/store/apps/details?id=com.modhaus.cosmo)** objekts with trust-minimized exchanges.

**Objekt Trade is not affiliated with, endorsed by or supported by MODHAUS or its artists.**

## Overview

Cosmo only supports one-way transfers, requiring trust between traders. This platform minimizes that risk through trade matching, transfer verification, and ownership monitoring.

## Features

- Create bulletin-board style trade posts with specific objekts
- Automatic matching algorithm finds compatible trades
- Track active trades with real-time status updates
- Verify objekt transfers via external indexer APIs
- Monitor ownership to ensure offered objekts remain available
- Link Cosmo account via status message verification
- Support for "any" filters (e.g., "any member", "any season")
- Trade notifications and history
- Automatic trade expiration and availability checks if objekts are unavailable for trade

## Project

- `src/app`: Next.js app router with auth, trades, and active trade pages
- `src/components`: Reusable UI components (objekts, trades, shadcn/ui)
- `src/lib`: Core logic (auth, database, Cosmo API, trade matching, Redis)
- `drizzle`: Database migrations

## Requirements

- [Node.js](https://nodejs.org/) 20+
- [PostgreSQL](https://www.postgresql.org/)
- [Redis](https://redis.io/)
- Cosmo account for testing

## Setup

```bash
git clone <repository-url>
cd objekt-trade
npm install
cp .env.example .env.local
# Configure DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
npx drizzle-kit push
npm run dev
```

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
- **activeTrade**: Agreed trades between two users
- **activeTradeSide**: Individual objekts being exchanged per side
- **tradeNotification**: User notifications for trade events

## Trade Flow

1. Link Cosmo account by setting verification code in status message
2. Create trade post with specific objekts to offer and request
3. System finds users who have what you want and want what you have
4. Initiate trade with matched party
5. Counterparty accepts trade
6. Both parties transfer objekts via Cosmo app
7. System detects and verifies transfers
8. Trade completes when both sides confirmed

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

## Development

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run Biome linter
npm run format   # Format code with Biome
```

### Database Migrations

```bash
npx drizzle-kit generate  # Generate migration
npx drizzle-kit push      # Apply migration
npx drizzle-kit studio    # Open Drizzle Studio
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
