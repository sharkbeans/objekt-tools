-- Migration 0017: Trade offer quota
--
-- Adds a per-user cap on the number of pending trade offers (where the user is
-- the initiator). The quota is checked dynamically at offer-creation time:
--
--   remaining = trade_offer_quota - count(pending active_trades as initiator)
--
-- Default is 10. Increase per-user for premium tiers or trusted traders.
-- Accepted/declined/cancelled trades automatically free up quota since they
-- leave "pending" status.

ALTER TABLE "user"
  ADD COLUMN trade_offer_quota INTEGER NOT NULL DEFAULT 10;
