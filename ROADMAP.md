# Objekt Trade - Roadmap

## Priority Order

| # | Feature | Priority | Effort | Rationale |
|---|---------|----------|--------|-----------|
| 1 | Non-transferable objekt filtering | P0 - Critical | Medium | Prevents broken trades; core integrity issue |
| 2 | Trade expiration (~7 days) | P1 - High | Low-Medium | Keeps listings fresh; reduces stale trade clutter |
| 3 | Browse/search filters | P2 - Medium | High | Improves discovery as trade volume grows |
| 4 | Admin login with delete perms | P3 - Low | Medium | Moderation tool; users can already self-manage |

---

## 1. Non-Transferable Objekt Filtering

**Problem:** Some objekts are marked non-transferable at the smart contract level. Users can currently list these in trades, leading to trades that can't be completed.

**Approach:**
- The `objekt.top` owned-by API already returns objekt data - investigate if `transferable` field is included in the response
- If not available from objekt.top, query the Typesense search index at `search.apollo.cafe` which indexes `transferable` status (see objekt-explorer's worker job `transferable.ts`)
- Filter out non-transferable objekts in `GET /api/objekts/owned` before returning to the client
- Add a visual indicator on objekt cards for transferability status
- Optionally: warn users if they somehow select a non-transferable objekt

**Key references:**
- objekt-explorer schema: `transferable` boolean field on owned objekts
- objekt-explorer worker: `apps/worker/src/job/transferable.ts` - batch checks NFT metadata
- Current owned endpoint: `src/app/api/objekts/owned/route.ts`

**Tasks:**
- [ ] Check objekt.top API response for `transferable` field
- [ ] If missing, find alternative data source (Typesense or direct contract query)
- [ ] Filter non-transferable objekts from owned picker results
- [ ] Add UI indicator for transferable status
- [ ] Add validation on trade creation to reject non-transferable items

---

## 2. Trade Expiration (~7 Days)

**Problem:** Trades stay open indefinitely, cluttering the listing with stale posts where users may no longer have the items or interest.

**Approach:**
- Add an `expiresAt` column to `tradePost` table (default: `createdAt + 7 days`)
- Filter expired trades from `GET /api/trades` queries
- Add a cron job or on-read cleanup to mark expired trades as `"expired"` status
- Allow users to bump/renew their trades (reset expiration)
- Show time remaining on trade cards

**Tasks:**
- [ ] Add `expiresAt` timestamp column to `tradePost` schema
- [ ] Run migration
- [ ] Update `GET /api/trades` to exclude expired trades (`WHERE expiresAt > NOW()`)
- [ ] Add `"expired"` to trade status enum
- [ ] Add expiration display on trade cards (e.g., "Expires in 3d")
- [ ] Add renew/bump endpoint (`PATCH /api/trades/[id]/renew`)
- [ ] Optional: scheduled job to batch-update expired statuses

---

## 3. Browse/Search Filters

**Problem:** Currently only a basic member name text filter exists. As trade volume grows, users need structured filters to find relevant trades.

**Filters to implement** (reference: objekt-explorer `use-filters.ts`):
- **Artist** - artms, tripleS, idntt (multi-select)
- **Member** - dependent on artist selection (multi-select)
- **Season** - Atom01, Binary01, etc. (multi-select)
- **Class** - First, Double, Special, etc. (multi-select)
- **Edition** - 1, 2, 3 (multi-select)
- **On/Offline** - Physical vs digital (toggle)
- **Sort by** - Date (default), member, season, collection number
- **Sort direction** - Ascending / Descending
- **Group by** - Artist, member, season, class

**Approach:**
- Use URL query params for filter state (like objekt-explorer uses `nuqs`)
- Apply filters server-side in the trades API query for performance
- Add filter UI bar above trade grid using shadcn multi-select/popover components
- Filters apply to the `tradePostHave` and `tradePostWant` joined data

**Tasks:**
- [ ] Define filter types and URL param schema
- [ ] Update `GET /api/trades` to accept and apply filter params server-side
- [ ] Build filter bar component (artist, member, season, class dropdowns)
- [ ] Add sort/direction controls
- [ ] Add group-by option with collapsible sections
- [ ] Add edition and on/offline filters
- [ ] Populate filter options dynamically from available trade data
- [ ] Persist filter state in URL for shareability

---

## 4. Admin Login with Delete Permissions

**Problem:** No moderation tools exist. If a user posts inappropriate or spam trades, only they can delete them.

**Approach:**
- Add a `role` column to the `user` table (`"user"` default, `"admin"`)
- Create admin middleware that checks role on protected routes
- Add admin-only `DELETE /api/trades/[id]` override (bypass ownership check)
- Build a simple admin dashboard or add delete buttons visible only to admins on trade cards
- Seed initial admin user via env var or database script

**Tasks:**
- [ ] Add `role` column to `user` table with migration
- [ ] Create `requireAdmin()` auth helper
- [ ] Update `DELETE /api/trades/[id]` to allow admin override
- [ ] Add admin indicator in UI (delete button on any trade card)
- [ ] Optional: admin dashboard page at `/admin` with trade management
- [ ] Document how to promote a user to admin

---

## Dependencies

```
[1. Non-transferable filter] ──> standalone, do first
[2. Trade expiration] ──> standalone, simple schema change
[3. Filters] ──> benefits from #1 (transferable filter option)
[4. Admin] ──> standalone, but more useful after #3 (more trades to moderate)
```

Features 1 and 2 are independent and could be worked on in parallel.
Feature 3 can incorporate the transferable filter from feature 1.
Feature 4 can be done at any time but is least urgent.
