# Counter-Offer System

## Overview

Allow the **recipient** of a pending trade offer to propose a modified version of the trade instead of simply accepting or rejecting it. Counter-offers create a new `activeTrade` record (new ID) and auto-cancel the original, preserving a linked negotiation chain.

### Core design decision

**New ID per counter-offer.** The original `activeTrade` is marked `"countered"` (new status) and a new `activeTrade` is created linking back to it. This keeps the existing lifecycle (`pending -> accepted -> partial -> completed`) intact and preserves full audit history.

### Who can counter-offer?

The **current recipient** of the latest pending offer in the chain. After a counter-offer, roles flip -- the original initiator becomes the new recipient and can counter back. This naturally alternates turns.

---

## Phase 1: Schema & Data Model

**Goal:** Add the database columns and types needed to support counter-offers.

### 1.1 Add `counterOfferToId` column to `activeTrade`

In `src/lib/db/schema.ts`, add to the `activeTrade` table:

```ts
counterOfferToId: text("counter_offer_to_id").references(() => activeTrade.id, { onDelete: "set null" }),
```

This is a nullable self-referencing FK. When set, it means "this trade is a counter-offer to that trade."

### 1.2 Add `"countered"` to the `activeTrade.status` type

Update the status union type:

```ts
status: text("status").notNull().default("pending").$type<
  "pending" | "accepted" | "partial" | "completed" | "cancelled" | "countered" | "disputed"
>(),
```

### 1.3 Add relation for counter-offer chain

Add to `activeTradeRelations`:

```ts
counterOfferTo: one(activeTrade, {
  fields: [activeTrade.counterOfferToId],
  references: [activeTrade.id],
  relationName: "counterOfferChain",
}),
counterOffers: many(activeTrade, { relationName: "counterOfferChain" }),
```

### 1.4 Generate and run migration

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### 1.5 Update `TradeStatus` type in the UI

In `src/app/active-trades/[id]/page.tsx`, update the `TradeStatus` type to include `"countered"`.

Any other files that reference the trade status union (history page, active trades list, etc.) should also be updated.

### Done when:
- [ ] `counterOfferToId` column exists in DB
- [ ] `"countered"` status is recognized in schema and UI types
- [ ] Relations are defined
- [ ] Migration runs cleanly

---

## Phase 2: API Route — Create Counter-Offer

**Goal:** `POST /api/active-trades/[id]/counter-offer` endpoint that creates a counter-offer.

### 2.1 Create the route file

`src/app/api/active-trades/[id]/counter-offer/route.ts`

### 2.2 Validation rules

1. **Auth required** -- `requireSession()`
2. **Rate limit** -- reuse the `rate-limit:initiate:{userId}` pattern (10/60s)
3. **Caller must be the recipient** of the original trade (`activeTrade.recipientUserId === session.user.id`)
4. **Original trade must be `"pending"`** -- cannot counter an accepted/completed/cancelled/countered trade
5. **Blocking trade guard** -- `getBlockingTradeId()` check, same as initiate
6. **Objekt validation** -- all objekts must have `objektId`, max 10 per side
7. **Counter-offer chain depth limit** -- walk `counterOfferToId` chain, reject if depth >= 10 (prevents infinite ping-pong)
8. **Cosmo accounts** -- both parties must have linked wallets

### 2.3 Transaction logic

Inside a single DB transaction:

1. Set original `activeTrade.status` to `"countered"`
2. Insert new `activeTrade` with:
   - `counterOfferToId` = original trade ID
   - `initiatorUserId` = current user (was the recipient, now becomes initiator)
   - `recipientUserId` = original initiator (now reviews the counter)
   - `tradePostId` = original `matchedTradePostId` (counter-offerer's post, may be null)
   - `matchedTradePostId` = original `tradePostId` (other party's post, may be null)
   - `status` = `"pending"`
3. Insert `activeTradeSide` rows for both parties with the new objekt selections
4. Create a notification for the other party: "X sent you a counter-offer"

### 2.4 Request body

```ts
{
  myObjekts: SideInput[];    // what the counter-offerer will send
  theirObjekts: SideInput[]; // what they want from the other party
}
```

Same `SideInput` shape used by `initiate` and `initiate-direct`.

### Done when:
- [ ] Route exists and creates a new `activeTrade` linked to the original
- [ ] Original trade is set to `"countered"`
- [ ] Notification sent to the other party
- [ ] All validation rules enforced
- [ ] Chain depth limit works

---

## Phase 3: UI — Counter-Offer Button & Flow (Active Trade Page)

**Goal:** Add a "Counter-Offer" button on the active trade detail page for the recipient of a pending trade.

### 3.1 Show "Counter-Offer" button

In `src/app/active-trades/[id]/page.tsx`:

- Only visible when:
  - Trade status is `"pending"`
  - Current user is `recipientUserId`
- Positioned alongside the existing "Accept" and "Cancel/Decline" buttons

### 3.2 Counter-offer modal/drawer

When clicked, open a modal or expandable section that:

1. **Pre-fills** both sides with the current trade's objekts (so user2 starts from the existing proposal, not from scratch)
2. Lets user2 **modify** either side:
   - Remove objekts from either side
   - Add new objekts from their own inventory (their side)
   - Add new objekts they want from the other party's inventory (other side)
3. Shows a clear **diff view** before submitting -- highlights what changed vs the original offer (added/removed on each side)

### 3.3 Objekt picker reuse

Reuse the existing objekt selection components from the trade initiation flow (inventory browser, objekt search). These likely live in `src/components/trades/` or the initiate pages.

### 3.4 Submit and redirect

On submit:
- Call `POST /api/active-trades/[id]/counter-offer`
- On success: redirect to the new counter-offer's active trade page
- On error: show toast with error message

### Done when:
- [ ] "Counter-Offer" button appears for recipient of pending trades
- [ ] Modal pre-fills with current trade objekts
- [ ] User can modify both sides
- [ ] Diff view shows changes before submit
- [ ] Submitting creates the counter-offer and redirects

---

## Phase 4: Counter-Offer Status Display & History Chain

**Goal:** Make countered trades and counter-offer chains visible and navigable.

### 4.1 "Countered" status badge

Add a `"countered"` badge style (e.g., blue/purple) alongside existing status badges in:
- Active trade detail page
- Active trades list (`/active-trades`)
- Trade history (`/active-trades/history`)

### 4.2 Link to counter-offer from countered trade

On a trade with status `"countered"`, show a banner/link:

> "This trade was countered. [View counter-offer ->]"

Query the `activeTrade` where `counterOfferToId` = this trade's ID to find the counter-offer.

### 4.3 Negotiation thread view

On any trade that's part of a counter-offer chain, show a collapsible "Negotiation History" section:

- Walk the chain via `counterOfferToId` to find all linked trades
- Display as a timeline: Original Offer -> Counter #1 -> Counter #2 -> ...
- Each entry shows: who proposed it, what objekts were on each side, the outcome (countered/cancelled/accepted)
- Current (latest) offer is highlighted

### 4.4 Update history page

Trades with status `"countered"` should appear in the history page with appropriate filtering.

### Done when:
- [ ] "Countered" badge renders correctly everywhere
- [ ] Countered trades link to their counter-offer
- [ ] Negotiation history timeline is viewable
- [ ] History page includes countered trades

---

## Phase 5: Guard Rails & Edge Cases

**Goal:** Harden the system against abuse and handle edge cases.

### 5.1 Counter-offer chain depth limit

Already handled in Phase 2 API validation (max 10 rounds). In Phase 5, add a UI indicator:

> "Counter-offer limit: 7/10 remaining"

### 5.2 Rate limiting per user-pair

Add a separate rate limit key: `rate-limit:counter:{sortedUserPair}` -- max 3 counter-offers per hour between the same two users. This prevents ping-pong spam even within the chain depth limit.

### 5.3 Expiry on pending counter-offers

When creating a counter-offer, set `expiresAt` to 48 hours from now. Add a check (either on page load or via a cron/background job) that auto-cancels expired pending trades.

Display a countdown on the UI: "Expires in 23h 45m"

### 5.4 Race condition protection

In the counter-offer API transaction, re-verify the original trade is still `"pending"` inside the transaction:

```ts
const [updated] = await tx
  .update(activeTrade)
  .set({ status: "countered", updatedAt: new Date() })
  .where(and(
    eq(activeTrade.id, originalTradeId),
    eq(activeTrade.status, "pending"),
  ))
  .returning();

if (!updated) {
  tx.rollback();
  // trade was already accepted/cancelled/countered
}
```

### 5.5 Availability check on counter-offer objekts

When creating a counter-offer, verify the counter-offerer still owns the objekts they're proposing to send (hit the Cosmo inventory API). Same validation done in the initiate flow.

### 5.6 Blocking trade guard for counter-offers

Ensure `getBlockingTradeId()` is called before allowing a counter-offer (already in Phase 2, but verify it works correctly when the user is the recipient of the blocking trade).

### 5.7 Prevent countering your own counter-offer

The API already enforces "caller must be recipient," which naturally prevents this. But add an explicit check: if the caller is the `initiatorUserId`, return 403 with a clear message.

### Done when:
- [ ] Chain depth limit shown in UI
- [ ] Per-pair rate limiting active
- [ ] Expiry set and auto-cancelled
- [ ] Race conditions handled in transaction
- [ ] Availability check runs on counter-offer creation
- [ ] All guard rails tested

---

## Phase 6: Notifications & Polish

**Goal:** Clean up the notification experience and finalize UX.

### 6.1 Counter-offer notification

When a counter-offer is created, notify the other party:

> "[User] sent you a counter-offer for trade [link]"

Include a direct link to the new counter-offer's active trade page.

### 6.2 Notification grouping

If a counter-offer chain generates multiple notifications, group them in the notification list under a single trade thread to reduce noise.

### 6.3 Counter-offer diff in notification

Optionally include a brief summary of what changed in the notification:

> "[User] counter-offered: removed Jiu A203, added SuA B105"

### 6.4 Cancel behavior for counter-offer chains

When a counter-offer is cancelled (by either party):
- Only the current (latest) pending counter-offer is cancelled
- Previous trades in the chain remain `"countered"` (they're historical)
- The trade posts are NOT affected (posts should stay `"open"` since counter-offers are all in `"pending"` state, not `"accepted"`)

### 6.5 What happens when a counter-offer is accepted?

Normal accept flow -- the counter-offer is just a regular `activeTrade` with `"pending"` status. The existing accept logic works unchanged. Posts transition to `"in_trade"` at acceptance time as usual.

### Done when:
- [ ] Notifications work for counter-offers
- [ ] Grouped notifications avoid spam
- [ ] Cancel on counter-offers behaves correctly
- [ ] Accept on counter-offers works via existing flow
- [ ] End-to-end flow tested: offer -> counter -> counter -> accept

---

## Loopholes & Mitigations Summary

| Risk | Mitigation | Phase |
|------|-----------|-------|
| Counter-offer spam (infinite ping-pong) | Chain depth limit (10), per-pair rate limit (3/hr) | 2, 5 |
| Stalling/time-wasting | 48hr expiry on pending counter-offers | 5 |
| Bait-and-switch (swap objekts hoping user doesn't notice) | Diff view highlighting changes | 3 |
| Objekts no longer owned | Availability check at counter-offer creation | 5 |
| Blocking trade guard bypass | Same `getBlockingTradeId()` check | 2 |
| Race condition (counter while accepting/cancelling) | Status check inside DB transaction | 5 |
| Notification fatigue | Grouped notifications per trade thread | 6 |
| Self-counter (counter your own offer) | Enforced by recipient-only rule | 2 |
