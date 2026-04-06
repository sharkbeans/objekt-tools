# Pre-Deploy Checklist

Run this before merging anything into `main`.

- The change has already been deployed to a preview or staging environment.
- CI passed on the release candidate branch.
- `npm run build` succeeds locally or in CI.
- Env var changes were reviewed for preview vs production separation.
- `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` match the production domain.
- Database changes are backward-compatible or have an explicit rollout plan.
- Redis, Pusher, Discord, and cron behavior were checked for production impact.
- Any risky crawler, auth, notification, or scheduled-job change was smoke-tested.
- Any temporary debug route, seed-only helper, or test secret was removed.
- The rollback path is known if the deploy misbehaves.
