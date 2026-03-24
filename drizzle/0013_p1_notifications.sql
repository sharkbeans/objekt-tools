-- P1.1: Add activeTradeId to notifications + composite index
-- Run this in the Neon console before deploying P1 changes.

ALTER TABLE trade_notification ADD COLUMN active_trade_id TEXT REFERENCES active_trade(id) ON DELETE SET NULL;
CREATE INDEX trade_notification_user_dismissed_idx ON trade_notification(user_id, dismissed);
