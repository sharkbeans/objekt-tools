# objekt.my

All-in-one Cosmo tools for [MODHAUS](https://www.mod-haus.com/)' **[Cosmo: the Gate](https://play.google.com/store/apps/details?id=com.modhaus.cosmo)** collectors — trade matching, objekt design, poster generation, and more.

**objekt.my is not affiliated with, endorsed by, or supported by MODHAUS or its artists.**

## Tools 

**[Objekt Trade](https://objekt.my/trades)** — Browse and match Cosmo objekt trades. Get auto-matched with other collectors and receive instant Discord notifications—no more searching through lists or DMs.

**[Objekt Maker](https://objekt.my/objekt-maker)** — Design custom Objekts with full front/back control. Add borders, text, logos, signatures, QR codes, then save presets and bulk export.

**[Proofshot](https://objekt.my/proofshot)** — Generate photocard proofshot images for trades and collections.

**[Objekt Poster](https://objekt.my/post)** — Turn your trade list into a clean, shareable image in seconds. Paste your list and download a structured template instantly.


## Trades Feature Overview

Cosmo only supports one-way transfers, requiring trust between traders. The trades tool minimizes that risk through trade matching, transfer verification, and ownership monitoring.

Cosmo account linking uses a simple status message verification flow: users set a short code such as `verify-123456` in their Cosmo profile status, and the platform reads it to confirm ownership. Cosmo credentials, session tokens, and account access are never requested or stored.

## Features

- Create post-style trade posts with specific objekts
- Automatic matching algorithm finds compatible trades
- Track active trades with realtime status updates via Pusher
- Verify objekt transfers via external indexer APIs
- Monitor ownership to ensure offered objekts remain available
- Link Cosmo account via status message verification without collecting credentials
- Support "any" filters such as any member or any season
- Trade notifications with unread counts, a dedicated `/notifications` page, and optional Discord DMs
- Automatic trade expiration and availability checks when objekts become unavailable
- Counter-offer flow for modified trade terms
- Edit or renew trade posts depending on trade activity state
- Public user profiles at `/user/[nickname]` with completed, cancelled, and defaulted trade stats
- Trade ban system with automatic lifting after obligations are fulfilled
- Paste-to-trade importer for bulk objekt entry from community paste formats
- Objektify tool for custom objekt design with full front/back editor
- Proofshot tool for generating photocard proofshots
- Poster tool for converting trade lists into shareable images

## Stack

- Next.js 16
- TypeScript
- Drizzle ORM
- Better Auth
- PostgreSQL
- Redis
- Tailwind CSS 4
- shadcn/ui
- TanStack Query
- Zustand
- Biome
- Docker for prod

## Deployment Model

Production is built around:

- A Dockerized Next.js app
- A self-hosted PostgreSQL container
- A Redis container
- A small cron container that calls `/api/cron/expire-trades`
- GitHub Actions SSH deploys to the VPS on pushes to `main`

The app container runs Drizzle migrations automatically on startup via [`entrypoint.sh`](/home/jytan/Documents/Git/objekt-trade/entrypoint.sh).

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Copy the local env template:

```bash
cp .env.local.example .env.development.local
```

3. Start local Postgres and Redis however you prefer, then update `DATABASE_URL` and `REDIS_URL` in `.env.development.local`.

Example local values:

```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/objekt_trade?sslmode=disable"
REDIS_URL="redis://127.0.0.1:6379"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

4. Apply the schema:

```bash
npx drizzle-kit push
```

5. Start the app:

```bash
npm run dev
```

Optional local utilities:

```bash
npx drizzle-kit studio
npx tsx scripts/seed-local.ts
```

## VPS Deployment

The repo includes a production-ready Docker setup in [`Dockerfile`](/home/jytan/Documents/Git/objekt-trade/Dockerfile), [`docker-compose.yml`](/home/jytan/Documents/Git/objekt-trade/docker-compose.yml), and [`.env.docker.example`](/home/jytan/Documents/Git/objekt-trade/.env.docker.example).

Before running the stack on a VPS, enable Redis memory overcommit on the host:

```bash
sudo sysctl vm.overcommit_memory=1
echo 'vm.overcommit_memory = 1' | sudo tee -a /etc/sysctl.conf
```

This avoids the Redis warning about background saves or replication failing under low-memory conditions.

Basic flow:

1. Copy the Docker env template on the VPS:

```bash
cp .env.docker.example .env
```

2. Fill in the real production values in `.env`.

Important variables:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `CRON_SECRET`

Optional variables:

- `INDEXER_DATABASE_URL`
- `REMBG_SERVICE_URL`
- `REMBG_MODEL`
- `DISCORD_BOT_TOKEN`
- `DISCORD_INVITE_URL`
- `DISCORD_GUILD_ID`
- `PUSHER_APP_ID`
- `PUSHER_KEY`
- `PUSHER_SECRET`
- `PUSHER_CLUSTER`
- `NEXT_PUBLIC_PUSHER_KEY`
- `NEXT_PUBLIC_PUSHER_CLUSTER`

3. Build and start the stack:

```bash
docker compose build
docker compose up -d
```

Services started by Compose:

- `postgres` on `127.0.0.1:5432`
- `redis`
- `rembg` for local Proofshot background removal
- `app` on port `3000`
- `cron` for nightly trade expiration

The `rembg` service is internal to the Docker network and is reached by the app through `REMBG_SERVICE_URL`. The app requests the person-focused `u2net_human_seg` model by default and the service stores downloaded model files in the `rembg-models` Docker volume. If needed, set `REMBG_MODEL` to another rembg model such as `u2net` or `birefnet-portrait`, at the cost of more RAM and slower CPU inference.

On deploy, the app container automatically runs database migrations before starting the Next.js server.

## CI/CD

[`cd.yml`](/home/jytan/Documents/Git/objekt-trade/.github/workflows/cd.yml) deploys to the VPS over SSH when `main` is updated. The remote deploy currently does:

```bash
git pull
docker compose build
docker compose up -d
```

## Commands

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run Biome checks
npm run format     # Format code with Biome
npm run typecheck  # Run TypeScript checks
```

```bash
npm run db:generate  # Generate migration files
npm run db:migrate   # Run migrations
npm run db:push      # Push schema directly to the database
```

## Credit / Acknowledgment

- [objekt-explorer](https://github.com/izrin96/objekt-explorer) for the Subsquid-based Objekt indexer database, which powers collection progress lookups and transfer verification.

## Contributing

This is a personal project. For feature requests or bug reports, please open an issue.

## Contact

- Discord: `@sharkbean`
