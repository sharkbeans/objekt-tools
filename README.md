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

Use the dedicated setup guide instead of reverse-engineering the app from source:

- Local setup and env reference: [docs/local-setup.md](docs/local-setup.md)
- Staging and preview workflow: [docs/staging-workflow.md](docs/staging-workflow.md)
- Production gate: [docs/pre-deploy-checklist.md](docs/pre-deploy-checklist.md)

Quick start:

```bash
npm install
cp .env.local.example .env.development.local
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/objekt_trade?sslmode=disable" npx drizzle-kit push
npm run dev
```

Important:

- Do not use `.env.local` for day-to-day development in this repo.
- Treat `main` as production-only.
- Pull preview and production Vercel env vars into their dedicated files, not into `.env.local`.

Helpful commands:

```bash
npm run vercel:env:pull:preview
npm run vercel:env:pull:production
npm run vercel:build:preview
npm run vercel:build:production
```

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
