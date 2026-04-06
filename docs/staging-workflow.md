# Staging and Deploy Workflow

This repo now treats `main` as production-only. Every change should be proven in a branch or in `staging` before it is allowed to reach production.

## Branch Strategy

- `main`: production branch, protected, merge-only
- `staging`: integration branch for release candidates
- `feature/<name>`: regular working branches opened as PRs into `staging`
- `hotfix/<name>`: urgent fixes opened as PRs into `main`, then back-merged into `staging`

## Expected Release Flow

1. Branch from `staging` for normal feature work.
2. Open a PR into `staging`.
3. Confirm CI passes and the Vercel preview deployment is healthy.
4. Smoke-test the change against staging data and staging integrations.
5. Merge `staging` into `main` only when the release is ready.
6. Run the pre-deploy checklist before merging to `main`.

If a change is risky, keep it on a feature branch longer instead of using `main` as the test surface.

## Vercel Setup

Use one of these two patterns and stick to it:

### Recommended: Separate staging project

- Production project: `objekt-trade`
- Staging project: `objekt-trade-staging`
- Production branch: `main`
- Staging branch: `staging`

Why this is safer:

- Staging can use a separate database, Redis instance, auth URL, and webhook targets.
- Preview experiments cannot accidentally inherit production-only settings.
- Production domains stay attached only to the production project.

### Acceptable fallback: Single project with preview deployments

Use this only if you do not want a second Vercel project yet.

- Keep `main` as the production branch in Vercel.
- Treat branch previews as the staging surface.
- Do not use production databases or production webhook targets in preview env vars.

## Environment Separation

Keep these values different between preview/staging and production:

| Variable | Preview / staging | Production |
| --- | --- | --- |
| `DATABASE_URL` | Staging database only | Production database only |
| `REDIS_URL` | Staging Redis only | Production Redis only |
| `BETTER_AUTH_URL` | Staging deployment URL | Production domain |
| `NEXT_PUBLIC_APP_URL` | Staging deployment URL | Production domain |
| `PUSHER_*` | Staging app/cluster if possible | Production app |
| `DISCORD_*` | Test app / test bot / test guild | Production app / bot / guild |
| `INDEXER_DATABASE_URL` | Same upstream only if unavoidable | Production value |

Rules:

- Never pull preview env vars into `.env.local`.
- Never point preview/staging at the production database.
- Never use production OAuth callback URLs in staging.
- Production secrets should exist only in the production environment.

## Local Vercel Helpers

Use the package scripts so preview and production env pulls land in different files:

```bash
npm run vercel:env:pull:preview
npm run vercel:env:pull:production
```

Those create:

- `.env.preview.local`
- `.env.production.local`

Do not rename either of those to `.env.local`.

To build what Vercel will deploy:

```bash
npm run vercel:build:preview
npm run vercel:build:production
```

## First-Time Dashboard Checklist

In Vercel:

1. Set the production branch to `main`.
2. Create a separate staging project or confirm preview deployments are enabled.
3. Add preview/staging environment variables explicitly.
4. Remove production custom domains from non-production projects.
5. Verify cron jobs only exist where intended.

In Git hosting:

1. Protect `main` from direct pushes.
2. Require PR review before merging to `main`.
3. Require CI to pass on `staging` and `main`.

## Cron Note

`vercel.json` defines the daily `/api/cron/expire-trades` job. If you use a separate staging project, decide whether staging should run the cron at all. If not, remove the cron from the staging project configuration before enabling automatic deploys there.
