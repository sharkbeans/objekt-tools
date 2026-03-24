# Feature Plan — objekt-trade

---

## P1: Critical Fixes

### P1.1 — Notifications Page

**Current state:** Notifications only show as warning banners on `/trades/mine`. No notification bell, no dedicated page, no unread count. Users must actively visit My Trades to discover they received an offer.

**Recommendation:** Yes, add a lightweight notifications page at `/notifications`.

**What to build:**
- **Navbar notification bell** with unread count badge (red dot with number)
  - Query: count of `tradeNotification` where `userId = session.user.id AND dismissed = false`
  - Poll every 30s (reuse existing interval)
- **`/notifications` page** with:
  - Chronological list of all notifications (dismissed + undismissed)
  - "Mark all as read" button
  - Each notification links to relevant trade (already has `tradePostId` field; add `activeTradeId` column)
  - Simple infinite scroll, no filters needed
- **Add missing notification events** (the biggest gap):
  - **Offer received**: when someone initiates a trade against your post → notify post owner
    - File: `src/app/api/trades/[id]/initiate/route.ts` — add insert after line ~186
    - File: `src/app/api/trades/[id]/initiate-direct/route.ts` — same
    - Message: `${initiatorName} sent you a trade offer on your post #${tradePostId}.`
  - **Counter-offer received**: currently only a chat message, not a notification
    - Already creates notification at `counter-offer/route.ts:303` — this is fine, no change needed
  - **Message received**: when partner sends a chat message
    - File: `src/app/api/active-trades/[id]/messages/route.ts` — add insert after message creation
    - Message: `${senderName} sent a message in Active Trade #${tradeId}.`
    - Deduplicate: only create if no undismissed message notification for this trade already exists

**Schema change:**
```sql
ALTER TABLE trade_notification ADD COLUMN active_trade_id TEXT REFERENCES active_trade(id);
CREATE INDEX trade_notification_user_dismissed_idx ON trade_notification(user_id, dismissed);
```

**Files to modify:**
- `src/lib/db/schema.ts` — add `activeTradeId` column, add composite index
- `src/app/api/trades/[id]/initiate/route.ts` — add notification insert
- `src/app/api/trades/[id]/initiate-direct/route.ts` — add notification insert
- `src/app/api/active-trades/[id]/messages/route.ts` — add notification insert
- `src/app/api/trades/mine/notifications/route.ts` — update query to include activeTradeId
- `src/components/navbar.tsx` — add notification bell with unread count
- `src/app/notifications/page.tsx` — new page (full notification history)

---

### P1.2 — Input Validation Fixes

**A. Description field — max 500 chars**

File: `src/app/api/trades/route.ts` (POST handler, around line 95-101)

```ts
// After extracting description from body:
if (description && description.length > 500) {
  return NextResponse.json({ error: "Description must be 500 characters or less" }, { status: 400 });
}
description = description?.trim() || null;
```

**B. Page number bounds**

File: `src/app/api/trades/route.ts` (GET handler, line 33)
File: `src/app/api/trades/mine/route.ts` (line 17)

```ts
// Change from:
const page = Number(params.get("page") ?? "1");
// To:
const page = Math.max(1, Math.floor(Number(params.get("page") ?? "1")) || 1);
```

**C. PATCH status validation**

File: `src/app/api/trades/[id]/route.ts` (PATCH handler, around line 70)

```ts
const validStatuses = ["open", "closed"] as const;
if (!validStatuses.includes(body.status)) {
  return NextResponse.json({ error: "Invalid status" }, { status: 400 });
}
```
Note: users should only be able to set "open" or "closed" — "in_trade" is system-managed.

**D. Notification dismiss array bounds**

File: `src/app/api/trades/mine/notifications/route.ts` (PATCH handler, line 37)

```ts
if (!ids?.length || ids.length > 100) {
  return NextResponse.json({ error: "Invalid notification IDs" }, { status: 400 });
}
```

**E. Search query length**

File: `src/app/api/objekts/search/route.ts` (line 9)

```ts
if (q && q.length > 200) {
  return NextResponse.json({ error: "Search query too long" }, { status: 400 });
}
```

**F. Array parameter bounds on objekt search**

File: `src/app/api/objekts/search/route.ts` (lines 10-13)

```ts
// After extracting array params, add:
const maxFilterItems = 20;
if (artists.length > maxFilterItems || members.length > maxFilterItems || ...) {
  return NextResponse.json({ error: "Too many filter values" }, { status: 400 });
}
```

**G. onOffline enum validation**

File: `src/app/api/objekts/search/route.ts` (line 42)

```ts
// Change from unsafe cast to validated:
const validOnOffline = ["online", "offline"] as const;
const onOffline = validOnOffline.includes(rawValue) ? rawValue : undefined;
```

---

### P1.3 — Rate Limiting

**Goal:** Prevent malicious spam, not punish normal usage. Keep limits generous.

**Endpoints to rate-limit:**

| Endpoint | Limit | Key | Rationale |
|----------|-------|-----|-----------|
| POST `/api/trades` (create post) | 10/min | `rate-limit:create-trade:{userId}` | Prevent trade post spam |
| POST `/api/trades/[id]/check-availability` | 10/min | `rate-limit:check-avail:{userId}` | Prevent repeated indexer queries |
| GET `/api/cosmo/search` | 10/min | `rate-limit:cosmo-search:{userId}` | Prevent user enumeration |
| POST `/api/active-trades/[id]/accept` | 5/min | `rate-limit:accept:{userId}` | Prevent rapid accept/cancel cycling |

**Implementation:** Reuse existing Redis rate-limit pattern from `initiate/route.ts`:

```ts
const rateLimitKey = `rate-limit:create-trade:${session.user.id}`;
const attempts = await redis.incr(rateLimitKey);
if (attempts === 1) await redis.expire(rateLimitKey, 60);
if (attempts > 10) {
  return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
}
```

**Files to modify:**
- `src/app/api/trades/route.ts` — POST handler
- `src/app/api/trades/[id]/check-availability/route.ts` — POST handler
- `src/app/api/cosmo/search/route.ts` — GET handler
- `src/app/api/active-trades/[id]/accept/route.ts` — POST handler

---

### P1.4 — Indexer Validation

**SKIPPED** — user confirmed foreign indexer data is trusted.

---

### P1.5 — Message Rate Limiting (1 per 10s)

File: `src/app/api/active-trades/[id]/messages/route.ts`

**Backend:**
```ts
// After auth check, before message insertion:
const msgRateKey = `rate-limit:message:${session.user.id}`;
const lastSent = await redis.get(msgRateKey);
if (lastSent) {
  return NextResponse.json({ error: "Please wait before sending another message." }, { status: 429 });
}
await redis.set(msgRateKey, "1", { ex: 10 }); // 10-second cooldown
```

**Frontend** (in `src/app/active-trades/[id]/page.tsx`):
- On 429 response: keep the send button disabled, don't clear the input
- No countdown timer shown (per user request — too much frontend clutter)
- Simple approach: mutation's `onError` handler checks for 429, shows a toast "Please wait a moment"
- Re-enable send button after the toast

---

### P1.6 — Expire Accepted/Partial Trades

**Current:** Only pending trades expire (30d). Accepted/partial trades live forever.

**New rules:**
1. **Default expiry:** Accepted/partial trades expire after **30 days** from `acceptedAt`
2. **WRONG_RECIPIENT expiry:** If any `tradeTransferLog` entry with event `wrong_recipient` exists for the trade AND no corresponding `recovered` entry exists, AND it's been **7 days** since the `wrong_recipient` was first logged → expire the trade
3. **Missing objekts:** If any promised objekts (either side) are no longer owned by the sender (transferred elsewhere) AND it's been **7 days** since this was first detectable → expire

File: `src/app/api/cron/expire-trades/route.ts`

**Add new section after existing expiry rules:**

```
Rule 4: Expire stale accepted/partial trades (30 days)
- Find: activeTrade with status IN ("accepted", "partial") AND acceptedAt < 30 days ago
- Action: Set status = "cancelled"
- Revert both trade posts to "open"
- Notify both parties: "Active Trade #X expired after 30 days without completion."

Rule 5: Expire trades with unrecovered wrong-recipient (7 days)
- Find: activeTrade with status IN ("accepted", "partial")
  - WHERE exists tradeTransferLog with event = "wrong_recipient"
    AND detectedAt < 7 days ago
    AND NOT exists tradeTransferLog with event = "recovered" for same objektId
- Action: Set status = "cancelled"
- Revert posts to "open"
- Notify both parties: "Active Trade #X was cancelled because a misrouted transfer was not recovered within 7 days."
```

**Schema consideration:** No schema change needed — `acceptedAt` and `tradeTransferLog.detectedAt` already exist.

**Files to modify:**
- `src/app/api/cron/expire-trades/route.ts` — add Rules 4 and 5

---

### P1.7 — Revert Trade Post to "open" on Cancel

**Current bug:** When a pending trade is cancelled, trade posts stay in their current state. Only accepted/partial cancellations revert posts. But there's also a gap: if ALL active trades for a post are cancelled/completed/countered, the post can be stuck as `in_trade` with no live trade.

File: `src/app/api/active-trades/[id]/cancel/route.ts` (around lines 93-100)

**Fix:** After setting trade to "cancelled", check if either trade post has any remaining non-terminal active trades. If not, revert to "open".

```ts
// After cancellation, for each post (tradePostId and matchedTradePostId):
const remainingTrades = await db.query.activeTrade.findFirst({
  where: and(
    or(
      eq(activeTrade.tradePostId, postId),
      eq(activeTrade.matchedTradePostId, postId)
    ),
    inArray(activeTrade.status, ["pending", "accepted", "partial"])
  ),
});

if (!remainingTrades) {
  // No active trades left — revert post to "open" (if currently "in_trade")
  await db.update(tradePost)
    .set({ status: "open" })
    .where(and(eq(tradePost.id, postId), eq(tradePost.status, "in_trade")));
}
```

**Files to modify:**
- `src/app/api/active-trades/[id]/cancel/route.ts`

---

## P2: Medium Priority Features

### P2.1 — Reduce Friction While Keeping Trades Immutable

**Principle:** All trades (including countered) remain permanently in the database. Never delete or modify historical trade data. Only add new records or update status fields.

**Friction points identified & fixes:**

**A. Trade post editing (while "open", no active trades)**
- Add `PATCH /api/trades/[id]` that allows updating description, adding/removing haves and wants
- **Constraint:** Only if post status is "open" AND no active trades reference this post (pending/accepted/partial)
- **Implementation:** Don't modify `tradePostHave`/`tradePostWant` rows — soft-delete old ones (add `deletedAt` column) and insert new ones
- This keeps historical data intact: old active trades that referenced removed haves/wants still have their data via `activeTradeSide`

**B. Trade post renewal**
- Add `POST /api/trades/[id]/renew` that reopens a closed/expired post
- Sets `status = "open"`, updates `createdAt` to now (so it appears fresh in browse)
- **Constraint:** Only if post has no active (pending/accepted/partial) trades
- Runs availability check before reopening (verifies user still owns the objekts)

**C. Trade post description-only edit**
- Allow description changes even when post has active trades (description doesn't affect trade mechanics)
- Other fields (haves/wants) locked while any active trade exists

**Schema change:**
```sql
ALTER TABLE trade_post_have ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE trade_post_want ADD COLUMN deleted_at TIMESTAMP;
```

**Files to create/modify:**
- `src/lib/db/schema.ts` — add `deletedAt` to have/want tables
- `src/app/api/trades/[id]/route.ts` — expand PATCH handler
- `src/app/api/trades/[id]/renew/route.ts` — new endpoint
- All queries that read haves/wants — add `WHERE deletedAt IS NULL` filter

---

### P2.2 — Public User Profiles (`/@cosmoUsername`)

**Route:** `src/app/[username]/page.tsx` (Next.js catch-all for `/@username` pattern)

Actually, since `@` is problematic in URLs, use: `/user/[nickname]/page.tsx`

**Profile page shows:**

| Section | Data Source | Query |
|---------|-----------|-------|
| Username + avatar | `cosmoAccount.nickname`, `user.image` | Join cosmoAccount → user |
| Member since | `cosmoAccount.linkedAt` | Direct field |
| **Completed trades** | Count of `activeTrade` where user is initiator or recipient AND status = "completed" | Aggregate query |
| **Cancelled trades** | Count where status = "cancelled" | Aggregate query |
| **Defaulted trades** | Count where status = "cancelled" AND user had unsent sides at cancellation time | Complex query (see below) |
| Active trade posts | Count of `tradePost` where status = "open" | Simple count |
| Trade ban status | From `tradeBan` table (see P2.3) | Direct lookup |

**"Defaulted" trades** — better term for "incompleted/malicious":
- A trade is "defaulted" when it was accepted but the user failed to send their promised objekts and the trade was cancelled (by timeout, by partner, or by system)
- Query: count `activeTrade` where:
  - User is initiator or recipient
  - Status = "cancelled"
  - `acceptedAt IS NOT NULL` (was accepted at some point)
  - User has at least one `activeTradeSide` with status = "pending" (never sent their objekt)

**Terminology:** "Defaulted" is better than "incompleted" because:
- "Defaulted" implies the user failed their obligation (accurate)
- "Incompleted" is ambiguous (could be the other party's fault)
- Alternative: "Unfulfilled" — also works well

**API endpoint:** `GET /api/users/[nickname]`
- Public endpoint (no auth required)
- Returns: nickname, image, linkedAt, stats (completed, cancelled, defaulted counts)
- Rate limited: 30/min per IP

**Files to create:**
- `src/app/user/[nickname]/page.tsx` — public profile page
- `src/app/api/users/[nickname]/route.ts` — stats API endpoint

---

### P2.3 — Trade Ban System

**Design philosophy:** Minimize user burden. No manual verification steps. System detects bad behavior automatically and bans. Unbanning happens automatically when obligations are met. Account hijacking is handled by allowing the real owner to fulfill obligations to get unbanned — the hijacker can't permanently damage the account because the fix (sending the promised objekts) is always available.

**Schema:**

```sql
CREATE TABLE trade_ban (
  id SERIAL PRIMARY KEY,
  cosmo_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id),
  reason TEXT NOT NULL,
  active_trade_id TEXT REFERENCES active_trade(id),
  created_at TIMESTAMP DEFAULT NOW(),
  lifted_at TIMESTAMP,
  lifted_reason TEXT
);

CREATE INDEX trade_ban_cosmo_id_idx ON trade_ban(cosmo_id);
CREATE INDEX trade_ban_user_id_idx ON trade_ban(user_id);
```

**How bans are triggered (automatic, 1 strike):**

A ban is issued when an accepted/partial trade is cancelled due to the user defaulting (not sending their objekts). This happens:

1. **24-hour timeout cancel:** Partner cancels after waiting 24h (existing Path C in cancel flow). The user who didn't send gets a strike.
2. **30-day expiry cancel:** Cron expires the accepted trade after 30d. Whichever user(s) had unsent sides get a strike.
3. **7-day wrong-recipient expiry:** Trade cancelled because wrong-recipient wasn't recovered. The user who sent to wrong address gets a strike.

**What a ban does:**
- Banned cosmoId cannot:
  - Create trade posts (`POST /api/trades`)
  - Initiate offers (`POST /api/trades/[id]/initiate`, `/initiate-direct`)
  - Send counter-offers (`POST /api/active-trades/[id]/counter-offer`)
  - Accept trades (`POST /api/active-trades/[id]/accept`)
- Banned user CAN still:
  - Browse trades (read-only)
  - View their profile and active trades
  - **Send objekts in existing accepted trades** (this is how they get unbanned)
  - Use check-transfers (so the system detects their sent objekts)

**How unbanning works (automatic):**

On every `check-transfers` call, after detecting confirmed transfers:
1. Check if the user has an active ban linked to this trade
2. If all the user's sides in the banned trade are now "confirmed" (they sent everything)
3. Auto-lift the ban: set `lifted_at = now`, `lifted_reason = "obligations fulfilled"`

**Account hijacking consideration:**

The system is inherently resilient because:
- If a hijacker accepts trades and doesn't send → account gets banned
- Real owner regains access → sees they have a ban with a specific trade
- Real owner sends the promised objekts → ban auto-lifts
- The worst case: real owner loses the objekts they must send (but these were already promised in the trade the hijacker accepted)
- **Mitigation:** Show a clear message on the ban page: "Your account was banned because objekts were not sent in Trade #X. Send the promised objekts to lift the ban. If your account was compromised, sending the objekts will restore full access."

**No appeal system needed** because:
- The fix is always mechanical (send the objekts)
- No human judgment required
- If the user truly can't send (objekts gone), they're in the same position as someone who defaulted — the system can't distinguish, and the partner deserves protection either way

**Ban check middleware:**

```ts
// Add to all write endpoints:
async function checkBan(userId: string): Promise<boolean> {
  const activeBan = await db.query.tradeBan.findFirst({
    where: and(
      eq(tradeBan.userId, userId),
      isNull(tradeBan.liftedAt)
    ),
  });
  return !!activeBan;
}
```

**Files to create/modify:**
- `src/lib/db/schema.ts` — add `tradeBan` table
- `src/lib/trade-guards.ts` — add `checkBan()` function
- `src/app/api/trades/route.ts` — POST: check ban before creating
- `src/app/api/trades/[id]/initiate/route.ts` — check ban
- `src/app/api/trades/[id]/initiate-direct/route.ts` — check ban
- `src/app/api/active-trades/[id]/counter-offer/route.ts` — check ban
- `src/app/api/active-trades/[id]/accept/route.ts` — check ban
- `src/app/api/active-trades/[id]/cancel/route.ts` — issue ban on default
- `src/app/api/active-trades/[id]/check-transfers/route.ts` — auto-lift ban on fulfillment
- `src/app/api/cron/expire-trades/route.ts` — issue ban on expiry-due-to-default
- Ban status display on profile page and navbar

---

### P2.4 — Counter-Offer Chain Cleanup (Immutable)

**User requirement:** Keep all trades immutable. Never delete or modify historical trade data. Just reduce visual clutter.

**Current problem:** When trade A gets countered by B, A stays "countered" forever. If B gets countered by C, B stays "countered" forever. When C completes, A and B are still "countered".

**Solution: Propagate a `resolvedByTradeId` field, don't change status.**

All trades keep their original status (`countered`, `completed`, `cancelled`). Add a field that links to the final resolution:

```sql
ALTER TABLE active_trade ADD COLUMN resolved_by_trade_id TEXT REFERENCES active_trade(id);
```

**When a counter-offer chain resolves (completes or cancels):**
1. Walk up the chain via `counterOfferToId`
2. For each ancestor trade, set `resolvedByTradeId` = the terminal trade's ID

**This means:**
- Status field: never changes after being set (immutable)
- `resolvedByTradeId`: tells the UI "this countered trade was ultimately resolved by trade X"
- UI can show: "Countered → resolved via Trade #X (completed)" or "Countered → resolved via Trade #X (cancelled)"

**Frontend improvement:**
- Trade history page: group counter-offer chains together
- Show chain as: Trade A (countered) → Trade B (countered) → Trade C (completed ✓)
- Collapsed by default, expandable

**Files to modify:**
- `src/lib/db/schema.ts` — add `resolvedByTradeId` column
- `src/app/api/active-trades/[id]/accept/route.ts` — on completion, propagate resolution up chain
- `src/app/api/active-trades/[id]/check-transfers/route.ts` — same, on transfer-driven completion
- `src/app/api/active-trades/[id]/cancel/route.ts` — on cancellation, propagate resolution up chain
- Trade history UI — group and display chains

---

## P3: Lower Priority

### P3.1 — WebSocket for Real-Time Updates ✅ DONE

**Goal:** Replace polling with push-based updates. Keep "Check Transfers" button as manual refresh (UX: user feels in control).

**Architecture:**

```
Client ←── WebSocket ──→ Next.js API Route (upgrade handler)
                              ↓
                         Redis Pub/Sub (broadcast channel)
                              ↑
              API routes publish events after mutations
```

**Events to push via WebSocket:**

| Event | Payload | Triggered by |
|-------|---------|-------------|
| `trade:offer-received` | `{ tradePostId, activeTradeId, initiatorName }` | initiate, initiate-direct |
| `trade:accepted` | `{ activeTradeId }` | accept |
| `trade:cancelled` | `{ activeTradeId, cancellerName }` | cancel |
| `trade:completed` | `{ activeTradeId }` | check-transfers, accept |
| `trade:transfer-detected` | `{ activeTradeId, count }` | check-transfers |
| `trade:counter-offer` | `{ activeTradeId, originalTradeId }` | counter-offer |
| `trade:message` | `{ activeTradeId, senderName }` | messages POST |
| `notification:new` | `{ notificationId, message }` | any notification insert |

**Client-side behavior:**
- Connect WebSocket on app mount (authenticated users only)
- On `trade:transfer-detected` → invalidate active trade query (replaces polling)
- On `notification:new` → invalidate notification count query, show toast
- **Keep "Check Transfers" button** — on click, calls `POST /check-transfers` which triggers server-side detection AND publishes WebSocket event. The button does a hard refresh of the page data (invalidate all queries for that trade). This keeps the user feeling in control.
- **Fallback:** If WebSocket disconnects, fall back to polling (existing intervals)

**Implementation approach:**
- Use Next.js API route with WebSocket upgrade
- Or: separate lightweight WebSocket server (e.g., on a different port)
- Redis Pub/Sub for cross-instance broadcasting (works with Vercel if using a custom server, or consider using Ably/Pusher for serverless-friendly WebSocket)

**Serverless consideration:** Vercel doesn't support persistent WebSocket connections on serverless functions. Options:
1. **Ably/Pusher** — managed WebSocket service, publish from API routes, subscribe from client. Simplest for serverless.
2. **Server-Sent Events (SSE)** — works on Vercel with streaming responses, but limited to one-way.
3. **Self-hosted WebSocket server** — if migrating off Vercel.

**Recommendation:** Use **Ably or Pusher** for now (managed, serverless-compatible). Publish events from API routes via their server SDK. Subscribe from client via their client SDK. Keep "Check Transfers" button for manual refresh.

**Implementation (Pusher):**
- `src/lib/realtime.ts` — server-side Pusher publish helpers (`publishTradeEvent`, `publishUserEvent`)
- `src/hooks/use-realtime.ts` — `useTradeRealtime(tradeId)` and `useUserRealtime(userId)` hooks (singleton Pusher client, React Query invalidation on events)
- `src/app/api/trades/[id]/initiate/route.ts` — publishes `notification:new` to recipient
- `src/app/api/trades/[id]/initiate-direct/route.ts` — publishes `notification:new` to recipient
- `src/app/api/active-trades/[id]/accept/route.ts` — publishes `trade:accepted` or `trade:completed`
- `src/app/api/active-trades/[id]/cancel/route.ts` — publishes `trade:cancelled`
- `src/app/api/active-trades/[id]/check-transfers/route.ts` — publishes `trade:transfer-detected` or `trade:completed`
- `src/app/api/active-trades/[id]/counter-offer/route.ts` — publishes `trade:counter-offer`
- `src/app/api/active-trades/[id]/messages/route.ts` — publishes `trade:message` + `notification:new`
- `src/app/active-trades/[id]/page.tsx` — calls `useTradeRealtime(id)`; polling intervals increased to 60s (fallback only)
- `src/components/navbar.tsx` — calls `useUserRealtime(userId)` for live notification count

**Required env vars:**
```
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=
```
All publish calls are fire-and-forget (`void`) — realtime is best-effort, polling remains as fallback.

---

### P3.2 — Zustand ✅ No action needed

**Keep as dependency.** No conflicts found with current system. Zustand v5 is tree-shakeable — unused imports add zero bundle size. If we implement saved searches or persistent UI preferences later, Zustand + localStorage persistence will be the right tool.

---

### P3.3 — Tests ✅ Skipped per user request

---

## Database Migration Summary

All schema changes needed across the plan:

```sql
-- P1.1: Notification improvements
ALTER TABLE trade_notification ADD COLUMN active_trade_id TEXT REFERENCES active_trade(id);
CREATE INDEX trade_notification_user_dismissed_idx ON trade_notification(user_id, dismissed);

-- P2.1: Trade post editing (soft-delete for haves/wants)
ALTER TABLE trade_post_have ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE trade_post_want ADD COLUMN deleted_at TIMESTAMP;

-- P2.3: Trade ban system
CREATE TABLE trade_ban (
  id SERIAL PRIMARY KEY,
  cosmo_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  reason TEXT NOT NULL,
  active_trade_id TEXT REFERENCES active_trade(id),
  created_at TIMESTAMP DEFAULT NOW(),
  lifted_at TIMESTAMP,
  lifted_reason TEXT
);
CREATE INDEX trade_ban_cosmo_id_idx ON trade_ban(cosmo_id);
CREATE INDEX trade_ban_user_id_idx ON trade_ban(user_id);

-- P2.4: Counter-offer chain resolution tracking
ALTER TABLE active_trade ADD COLUMN resolved_by_trade_id TEXT REFERENCES active_trade(id);

-- Performance indexes (found during analysis)
CREATE INDEX active_trade_expires_at_idx ON active_trade(expires_at);
CREATE INDEX active_trade_status_created_idx ON active_trade(status, created_at);  -- may already exist
CREATE INDEX trade_transfer_log_trade_event_idx ON trade_transfer_log(active_trade_id, event);
```

---

## Implementation Order

Suggested sequence (each step is independently deployable):

1. **P1.2** — Input validation fixes (pure backend, zero risk)
2. **P1.3** — Rate limiting (backend only, uses existing Redis pattern)
3. **P1.5** — Message rate limiting (backend + minor frontend)
4. **P1.7** — Trade post status revert fix (backend logic fix)
5. **P1.6** — Accepted trade expiry (cron job expansion)
6. **P1.1** — Notifications page + missing events (schema change + new page + API changes)
7. **P2.1** — Trade post editing/renewal (schema change + new endpoints)
8. **P2.4** — Counter-offer chain resolution (schema change + chain propagation)
9. **P2.2** — Public profiles (new page + new API)
10. **P2.3** — Trade ban system (schema change + middleware + ban/unban logic)
11. **P3.1** — WebSocket/real-time (infrastructure change, most complex)
