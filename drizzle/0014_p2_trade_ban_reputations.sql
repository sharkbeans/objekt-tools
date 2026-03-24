-- P2.1: Trade post editing (soft-delete for haves/wants)
ALTER TABLE trade_post_have ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE trade_post_want ADD COLUMN deleted_at TIMESTAMP;

-- P2.3: Trade ban system
CREATE TABLE trade_ban (
  id SERIAL PRIMARY KEY,
  cosmo_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  active_trade_id TEXT REFERENCES active_trade(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  lifted_at TIMESTAMP,
  lifted_reason TEXT
);
CREATE INDEX trade_ban_cosmo_id_idx ON trade_ban(cosmo_id);
CREATE INDEX trade_ban_user_id_idx ON trade_ban(user_id);

-- P2.4: Counter-offer chain resolution tracking
ALTER TABLE active_trade ADD COLUMN resolved_by_trade_id TEXT REFERENCES active_trade(id) ON DELETE SET NULL;

-- Performance indexes
CREATE INDEX active_trade_expires_at_idx ON active_trade(expires_at);
CREATE INDEX trade_transfer_log_trade_event_idx ON trade_transfer_log(active_trade_id, event);
