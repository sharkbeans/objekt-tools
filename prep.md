# objekt-trade — Codebase Reference

> Read this before working on tasks. Add findings after each session.

---

## Stack
- Next.js 16 + React 19, TypeScript, Tailwind CSS v4
- shadcn/ui + Radix UI, TanStack React Query v5, Zustand v5
- Better Auth, Drizzle ORM (drizzle-kit for schema push), Sonner toasts, Lucide icons
- Dark mode forced globally
- DB: Neon Postgres (schema changes applied manually in Neon console)
- Migration SQL files live in `drizzle/` (e.g. `0013_p1_notifications.sql`). Always create a new numbered SQL file for any schema change. The SQL is run manually — not auto-migrated.

---

## Directory Structure

```
src/
├── app/
│   ├── api/
│   │   ├── trades/                      # Trade post CRUD + offer endpoints
│   │   │   ├── route.ts                 # GET (list) + POST (create trade)
│   │   │   └── [id]/
│   │   │       ├── route.ts             # GET/PATCH/DELETE single trade
│   │   │       ├── initiate/route.ts    # POST — standard offer (user has own trade post)
│   │   │       ├── initiate-direct/route.ts  # POST — direct offer (no own post needed)
│   │   │       ├── matches/route.ts     # GET — find matching trades
│   │   │       └── check-availability/route.ts  # POST — verify haves still in inventory
│   │   ├── active-trades/
│   │   │   └── [id]/
│   │   │       ├── accept/route.ts      # Accept a trade
│   │   │       └── counter-offer/route.ts  # POST — counter-offer
│   │   └── objekts/
│   │       ├── owned/route.ts           # GET — current user's transferable objekts
│   │       ├── user/[address]/route.ts  # GET — another user's transferable objekts
│   │       └── search/route.ts          # GET — search objekts by query
│   ├── trades/
│   │   ├── page.tsx                     # Browse/list trades
│   │   ├── new/page.tsx                 # Create trade form
│   │   ├── [id]/page.tsx                # Trade detail page
│   │   ├── mine/page.tsx                # My trades
│   │   └── history/page.tsx             # Trade history
│   └── active-trades/
│       └── [id]/page.tsx                # Active trade detail (send/receive flow)
├── components/
│   ├── trades/
│   │   ├── trade-card.tsx               # Trade preview card (used in browse + matches)
│   │   ├── trade-filters.tsx            # Filter bar (artist, member, season, class, search)
│   │   ├── initiate-trade-dialog.tsx    # Standard offer dialog (owner → matched post)
│   │   ├── initiate-direct-dialog.tsx   # Direct offer dialog (non-owner)
│   │   └── counter-offer-dialog.tsx     # Counter-offer dialog
│   ├── objekt/
│   │   ├── objekt-owned-picker.tsx      # Pick from current user's inventory
│   │   ├── objekt-user-picker.tsx       # Pick from another user's inventory
│   │   └── objekt-picker.tsx            # Pick any objekt (for wants, no serial needed)
│   └── ui/                              # shadcn/ui primitives (button, card, badge, switch, etc.)
├── lib/
│   ├── db/
│   │   ├── schema.ts                    # Drizzle schema (all tables)
│   │   ├── index.ts                     # Main DB connection (Neon)
│   │   ├── indexer.ts                   # Indexer DB connection (separate Neon DB)
│   │   └── indexer-schema.ts            # Indexer tables (objekts, collections, etc.)
│   ├── filters.ts                       # Constants: validArtists, validSeasons, validClasses, membersByArtist
│   ├── filter-utils.ts                  # parseFiltersFromParams, tradeMatchesFilters, search parsing
│   ├── trade-guards.ts                  # getBlockingTradeId() — checks for unsent objekts
│   ├── wants-only-validation.ts         # validateWantsOnly() — wantsOnly offer restriction
│   ├── auth-client.ts                   # Better Auth client (useSession, etc.)
│   ├── auth-server.ts                   # requireSession() server helper
│   ├── cosmo/
│   │   └── types.ts                     # ObjektEntry interface
│   └── utils.ts                         # cn() and misc utilities
```

---

## Database Schema (Drizzle — `src/lib/db/schema.ts`)

### Core Tables

**tradePost** — A user's trade listing
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | 6-char nanoid |
| userId | text FK→user | creator |
| description | text? | optional note |
| status | text | "open" / "closed" / "in_trade" |
| wantsOnly | boolean | restrict offers to wants list only |
| createdAt, updatedAt | timestamp | |

**tradePostHave** — Specific objekts user offers
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tradePostId | text FK | |
| collectionId | text | unique objekt type identifier |
| collectionNo, member, season, class | text? | metadata |
| serial | integer? | specific copy# (from user's wallet) |
| objektId | text? | blockchain ID if owned |
| thumbnailUrl | text? | cached image |

**tradePostWant** — What user wants (specific OR filter-based)
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| tradePostId | text FK | |
| collectionId | text | empty string if isAny=true |
| collectionNo, member, season, class | text? | |
| isAny | boolean | true = filter want (e.g. "Any SeoYeon") |
| artist | text? | used for filter wants |
| thumbnailUrl | text? | |

**activeTrade** — An actual trade between two users
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | 6-char nanoid |
| tradePostId | text? FK | initiator's trade post (null for direct) |
| matchedTradePostId | text? FK | recipient's trade post (null for direct) |
| initiatorUserId | text FK | who sent the offer |
| recipientUserId | text FK | who receives the offer |
| counterOfferToId | text? FK→self | if this is a counter-offer |
| status | text | pending/accepted/partial/completed/cancelled/countered/disputed |
| acceptedAt, expiresAt | timestamp? | |
| acceptanceBlock | integer? | blockchain data |

**activeTradeSide** — Per-objekt row in a trade (1-10 per side)
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| activeTradeId | text FK | |
| userId | text FK | who sends this objekt |
| address | text | sender's blockchain address |
| recipientAddress | text | receiver's blockchain address |
| objektId | text | must be present |
| collectionId, collectionNo, member, serial, thumbnailUrl | | metadata |
| status | text | pending/sent/confirmed |

**Other tables:** user, session, account, verification (Better Auth), cosmoAccount, cosmoToken, tradeNotification, tradeMessage, tradeTransferLog

---

## Two Databases

1. **Main DB** (`src/lib/db/index.ts`) — app data: users, trades, active trades, notifications
2. **Indexer DB** (`src/lib/db/indexer.ts`) — read-only objekt/collection data from blockchain indexer
   - `objekts` table: owner, serial, transferable, collectionId, etc.
   - `collections` table: artist, member, season, class, collectionNo, thumbnailImage, etc.
   - Queried via `src/lib/db/indexer-schema.ts`

---

## Trade & Offer Flow

### Creating a Trade Post
1. User fills form at `/trades/new` — picks HAVE (owned objekts) and WANT (specific or "Any" filters)
2. POST `/api/trades` → creates `tradePost` + `tradePostHave` rows + `tradePostWant` rows
3. Validation: must have linked Cosmo account, no blocking active trade, min 1 have + 1 want

### Offer Paths (3 ways to initiate)

**A. Standard Offer** (`/api/trades/[id]/initiate`)
- Initiator MUST have their own open trade post
- Picks from their haves (myObjekts) + matched post's haves (theirObjekts)
- Both sides need objektId (specific serial)

**B. Direct Offer** (`/api/trades/[id]/initiate-direct`)
- Initiator does NOT need a trade post
- Picks from their wallet (ObjektOwnedPicker) + target post's haves
- `activeTrade.tradePostId` = null

**C. Counter-Offer** (`/api/active-trades/[id]/counter-offer`)
- Only recipient of a pending trade can counter
- Roles flip: recipient becomes initiator
- Max 10 rounds, 3 per hour per user pair
- 48-hour expiry

### Offer Validation (all 3 paths)
- Rate limit: 10/min per user
- Must have linked Cosmo account (both parties)
- No self-trading
- No duplicate pending/accepted/partial for same post pair
- getBlockingTradeId() — blocks if user has unsent objekts in accepted trade
- **wantsOnly**: if target post has wantsOnly=true, every objekt in myObjekts must match at least one want

### Matching (`/api/trades/[id]/matches`)
- Finds trades where: their haves overlap source's wants AND their wants overlap source's haves
- Collection-level matching (by collectionId)
- "Any" filter wants match broadly

---

## Key Types

**ObjektEntry** (`src/lib/cosmo/types.ts`)
```ts
interface ObjektEntry {
  collectionId: string;
  artist: string;
  member: string;
  collectionNo: string;
  season: string;
  class: string;
  thumbnailImage?: string;
  serial?: number;
  objektId?: string;
}
```

**SideInput** (used in offer API routes)
```ts
interface SideInput {
  objektId: string;
  collectionId: string;
  collectionNo?: string;
  member?: string;
  season?: string;
  class?: string;
  artist?: string;
  serial?: number;
  thumbnailUrl?: string;
}
```

---

## Filter System (`src/lib/filters.ts` + `src/lib/filter-utils.ts`)

- Filters: artist, member, season, class, on_offline
- Search supports: tag-based, range search (301z-302z), serial range (#1-20), negation (!), OR groups (comma-separated)
- `tradeMatchesFilters()` checks if any item in a trade matches
- `parseFiltersFromParams()` extracts from URLSearchParams
- Backend over-fetches 500 trades when filtered, applies in-memory, then paginates

---

## Wants-Only Feature (added this session)

- `tradePost.wantsOnly` boolean — set at creation, not editable
- Validation in `src/lib/wants-only-validation.ts`:
  - Specific wants: match by collectionId
  - Filter wants (isAny): match by member/season/class/artist (AND within one want, OR across wants)
  - Every offered objekt must match at least one want
- Enforced server-side on all 3 offer routes
- Client-side: trade detail page pre-checks user inventory, disables "Send a Trade Offer" button if no matching objekts
- UI: "Wants only" badge on trade detail page + trade cards
- Counter-offers: restriction checked against the original initiator's trade post (not inherited to new counter-offer chain)
