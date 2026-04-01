# Launch Plan

## Priority Order

### 1. Set up a safe staging workflow

Reason:
- This reduces the risk of breaking production every time `main` is updated.
- It makes every later change safer to ship, especially auth, crawl behavior, and install/docs changes.
- It is a smooth first step because it improves the workflow without forcing product decisions first.

Scope:
- Create a non-production branch strategy.
- Add a Vercel preview/staging project or make sure preview deployments are usable.
- Separate staging env vars from production env vars.
- Add a simple pre-deploy checklist for `main`.
- Install/configure the Vercel integration/plugin you want to use for local workflow.

Definition of done:
- We can test a branch safely before it touches production.
- `main` becomes production-only.

### 2. Redo the installation/setup documentation

Reason:
- Once staging exists, the install guide can be rewritten against the real intended workflow instead of the current improvised one.
- Good setup docs reduce future mistakes with env files, local DB, Redis, and third-party dependencies.
- This is also low-risk and straightforward compared with product behavior changes.

Scope:
- Rewrite local setup from scratch.
- Document required vs optional env vars clearly.
- Document staging vs production deployment flow.
- Document external dependency assumptions: Cosmo, indexer DB, Pusher, Discord, Redis, Postgres.
- Add troubleshooting notes for common failure modes.

Definition of done:
- A new contributor can boot the project locally without reading source code.
- Deploy flow and env separation are explicit.

### 3. Fix pagination and crawl-load behavior

Reason:
- This directly affects public traffic cost and load.
- It is probably not an emergency today because the main browse endpoint already defaults to 12 per page, but it is the next best production-hardening step.
- It is easier to do after staging is in place because crawl behavior changes are worth testing safely.

Scope:
- Audit every list/search endpoint for `page` and `limit`/`per_page` behavior.
- Replace over-fetch patterns where possible.
- Decide whether the homepage should server-render trade listings at all.
- Add crawl controls if needed:
  - `robots.txt`
  - `noindex`/`nofollow` on paginated or high-churn pages if appropriate
  - canonical URLs
  - prevent bots from auto-walking deep pagination
- Consider caching for public browse endpoints.

Known places already worth revisiting:
- `src/app/api/trades/route.ts`
- `src/app/api/trades/mine/route.ts`
- homepage behavior at `/`

Definition of done:
- Public list endpoints have explicit pagination rules.
- Robots cannot create avoidable load by crawling too broadly.

### 4. Decide whether to remove in-app P2P chat

Reason:
- This is partly a product decision, not just an engineering one.
- Removing it may improve simplicity, moderation risk, and support burden.
- It should come after staging and pagination work because those are safer, more objective launch tasks.

Recommendation:
- Unless chat is essential to closing trades inside the app, remove it before public launch.

Why:
- Users already use Discord.
- Chat introduces moderation, abuse, evidence retention, and UX complexity.
- The current 10-message retention makes it weak as a trust/safety feature anyway.

Options:
- Remove completely.
- Hide from UI but keep database tables temporarily.
- Keep only a minimal “contact on Discord” flow.

Definition of done:
- The product has one clear communication path.
- If chat remains, it must have a real retention and moderation stance.

### 5. Improve resilience around the external indexer dependency

Reason:
- This is important, but it is less smooth to tackle first because you cannot fully solve the dependency itself without replacing the provider.
- The right near-term goal is graceful degradation and clearer failure handling on our side.

What we can do on our end:
- Stop eagerly creating the indexer DB client at module import time.
- Lazy-init the indexer connection only inside routes that need it.
- Return explicit degraded responses when the indexer is unavailable.
- Add timeouts, error boundaries, and user-facing fallback states.
- Cache successful reads where practical.
- Add operational checks/alerts so we know when the indexer is failing.
- Clearly mark which features depend on the external indexer.

What this will not solve:
- Bad upstream data quality.
- Upstream downtime longer than our cache window.
- Trust concerns about a third-party indexer’s correctness.

Definition of done:
- Indexer outages do not take unrelated parts of the app down.
- Users get predictable fallback behavior instead of route crashes.

## Recommended Execution Sequence

1. Create staging branch + Vercel preview workflow.
2. Rewrite installation/setup/deploy docs to match that workflow.
3. Audit pagination and homepage crawl behavior.
4. Make the product call on in-app chat and remove or simplify it.
5. Harden external indexer failure handling and degraded-mode UX.

## Notes

### About the indexer

You do not need to build your own indexer to improve things materially.
The biggest win is making indexer-dependent features fail softly instead of failing at import time or breaking unrelated pages.

### About the homepage

Twelve trades per page is already much better than an unbounded feed.
The bigger question is whether the homepage should eagerly expose browse content to bots at all, or whether browse should live behind a dedicated route with clearer crawl rules.

### About chat

If Discord is the real communication channel already, removing app chat is likely the cleaner public-launch choice.
It shrinks product surface area and avoids launching a half-supported trust feature.
