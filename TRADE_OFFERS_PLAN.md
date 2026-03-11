# Trade Offers — Improvement Plan

## Task Overview

Five improvements to the trade offers system, ordered by dependency and effort.

---

## 1. Change username to Cosmo name

**Where:** Anywhere a user's `name` is displayed in the context of trades — navbar avatar, active trade card, active trade detail page (`SideCard`, `CardDescription`), and the My Trades active trades list.

**How:** The `cosmoAccount` table already stores `nickname` (the Cosmo display name). The user's auth `name` is the email-derived name from Better Auth. We need to join `cosmoAccount` when fetching trade participants and surface `nickname` as the display name.

- Update `GET /api/active-trades` and `GET /api/active-trades/[id]` to include `cosmoAccount.nickname` alongside user fields.
- Update `GET /api/active-trades/[id]/route.ts` similarly.
- In the UI (`active-trades/[id]/page.tsx`, `trades/mine/page.tsx`), prefer `cosmoNickname ?? user.name` for display.
- Navbar avatar initial and dropdown name can stay as-is (auth session doesn't include cosmo nickname) or be enhanced separately.

---

## 2. Refresh banners on trade status changes

**Where:** `TradeNotifications` in `trades/mine/page.tsx` and the active trade detail in `active-trades/[id]/page.tsx`.

**What:** Banners (trade notifications + active trade status) do not auto-update when a trade expires, is accepted, or is cancelled by the other party. The active trade detail already polls every 30 s when not terminal. The notifications query has no polling.

**How:**
- Add `refetchInterval: 30_000` to the `trade-notifications` query so banners refresh automatically.
- When the active trade query detects a status change to `completed` / `cancelled` / `expired`, also invalidate `["trade-notifications"]` so the banner list updates immediately.
- For expiry: the `activeTrade` table has `expiresAt`. The check-availability endpoint or a new background check should mark expired trades as `cancelled` and insert a `tradeNotification` row. The frontend polling will then pick it up.

---

## 3. Let user clear trade banners with X

**Status:** Already implemented — `TradeNotifications` in `trades/mine/page.tsx` has per-banner dismiss buttons (X icon) and a "Dismiss all" link, backed by `PATCH /api/trades/mine/notifications`.

**Remaining gap:** The active trade detail page (`active-trades/[id]/page.tsx`) shows inline status messages (accepted, completed) but has no way to dismiss them — they are derived from trade status, not from `tradeNotification` rows.

**How:** No additional database changes needed. When the active trade reaches a terminal state (`completed` / `cancelled`), write a `tradeNotification` row so it appears in the My Trades banner list. The user can then dismiss it there via the existing X button. Optionally surface a one-click dismiss on the active trade detail page that marks it as `cancelled`-acknowledged in local state.

---

## 4. Add trade history page (no new DB tables)

**Where:** New page `/trades/history` or surfaced via a tab on `/trades/mine`.

**What:** Show completed and cancelled active trades for the current user. The `activeTrade` table already holds all historical records; we just need to query the terminal statuses (`completed`, `cancelled`, `disputed`).

**How:**
- Add a tab or link on `/trades/mine` — "History" alongside the current active trades section.
- Create `GET /api/active-trades?status=history` (or a dedicated route `GET /api/active-trades/history`) that returns trades with status in `["completed", "cancelled", "disputed"]`.
- Render a simple list with trade ID, counterparty Cosmo name, status badge, objekt thumbnails, and date. Link to the existing `/active-trades/[id]` detail page.
- No new DB tables required — all data already exists.

---

## 5. Add Objekt.top links to check

**Where:** Anywhere an objekt is displayed — `SideCard` in the active trade detail, trade post have/want cards.

**What:** Link the objekt thumbnail or collection number to its Objekt.top page so users can verify the item before or during a trade.

**How:**
- Objekt.top URL pattern: `https://objekt.top/objekts/<collectionId>` (for collection) or `https://objekt.top/objekts/<objektId>` for a specific serial (verify exact pattern).
- In `SideCard` (`active-trades/[id]/page.tsx`), wrap the thumbnail `<img>` or the `formatLabel` text in an `<a>` tag pointing to the Objekt.top URL.
- In trade post have/want displays (`trade-card.tsx`), add a small external link icon next to each objekt.
- `objektId` is stored on `activeTradeSide` and `tradePostHave`, so both have enough data.

---

## Implementation Order

| # | Task | Effort | Depends on |
|---|------|--------|------------|
| 5 | Objekt.top links | XS | — |
| 3 | Clear banners (X) — verify completeness | XS | — |
| 2 | Refresh banners on status change | S | — |
| 1 | Cosmo name display | S | — |
| 4 | Trade history page | M | 1 (cosmo name in history) |
