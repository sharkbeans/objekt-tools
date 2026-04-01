# Database Migrations

This project uses Drizzle's SQL migration files in `drizzle/`.

## Environment mapping

- Local development:
  - `DATABASE_URL` from `.env.local` or `.env.development.local`
- Testing branch:
  - Vercel `Preview` environment for branch `testing`
- Production:
  - Vercel `Production` environment

Each environment has its own database URL. Drizzle records applied migrations in the target database, so `drizzle-kit migrate` only applies new migration files.

## Normal workflow

1. Change the schema in `src/lib/db/schema.ts`
2. Generate a migration locally:

```bash
npm run db:generate
```

3. Apply it to your local database:

```bash
npm run db:migrate
```

4. Commit both the schema change and the new file in `drizzle/`
5. Push your branch

## Vercel deploy behavior

The Vercel build command runs:

```bash
drizzle-kit migrate && next build
```

That means every Vercel deployment will:

1. Use that environment's `DATABASE_URL`
2. Apply any new migrations
3. Build the app

This applies to:

- `testing` branch preview deployments
- production deployments from `main`

## Notes

- Use `npm run db:generate` and `npm run db:migrate` for normal work.
- Avoid `npm run db:push` on testing/production. `push` is only for quick development workflows.
- If a migration fails on Vercel, the deployment should fail instead of building against the wrong schema.
