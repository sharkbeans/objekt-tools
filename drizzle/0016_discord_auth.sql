-- Migration 0016: Discord-only authentication
--
-- Context: Switching from email/password + optional social to Discord-only login.
-- The primary motivation is that trade partners need a way to contact each other
-- off-site (e.g. to say "hey, accept my trade"). Email/password users had no
-- reachable identity. Discord login gives every user a contactable handle.
--
-- Changes:
--   1. Wipe all existing data (full reset — only testers existed at this point).
--   2. Drop email/password auth columns that Better Auth no longer needs
--      (password is stored in the `account` table, not `user`, so user table
--       schema is largely unchanged — Better Auth handles account linking).
--   3. Add discord_id and discord_username to the `user` table for fast lookups
--      without always joining to `account`.
--   4. Re-create all tables fresh with the new shape.
--
-- NOTE: Better Auth still creates the `account`, `session`, `verification` tables.
--       The `account` table stores the raw Discord OAuth tokens.
--       We denormalise discord_id + discord_username onto `user` for convenience.
--
-- Run on prod only after local is fully tested and verified.

-- ============================================================
-- 1. Full data wipe (all tables, all data)
-- ============================================================

DROP TABLE IF EXISTS trade_transfer_log CASCADE;
DROP TABLE IF EXISTS trade_message CASCADE;
DROP TABLE IF EXISTS active_trade_side CASCADE;
DROP TABLE IF EXISTS active_trade CASCADE;
DROP TABLE IF EXISTS trade_notification CASCADE;
DROP TABLE IF EXISTS trade_ban CASCADE;
DROP TABLE IF EXISTS cosmo_token CASCADE;
DROP TABLE IF EXISTS trade_post_have CASCADE;
DROP TABLE IF EXISTS trade_post_want CASCADE;
DROP TABLE IF EXISTS trade_post CASCADE;
DROP TABLE IF EXISTS cosmo_account CASCADE;
DROP TABLE IF EXISTS verification CASCADE;
DROP TABLE IF EXISTS session CASCADE;
DROP TABLE IF EXISTS account CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;

-- ============================================================
-- 2. Re-create Better Auth core tables (Discord-only shape)
-- ============================================================

CREATE TABLE "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  -- Denormalised from the `account` table for fast profile lookups
  discord_id TEXT UNIQUE,
  discord_username TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 3. Re-create custom tables (unchanged shape)
-- ============================================================

CREATE TABLE cosmo_account (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  address TEXT NOT NULL UNIQUE,
  nickname TEXT,
  cosmo_id INTEGER,
  linked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE trade_post (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  wants_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX trade_post_user_id_idx ON trade_post(user_id);
CREATE INDEX trade_post_status_created_idx ON trade_post(status, created_at);

CREATE TABLE trade_post_have (
  id SERIAL PRIMARY KEY,
  trade_post_id TEXT NOT NULL REFERENCES trade_post(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL,
  collection_no TEXT,
  member TEXT,
  season TEXT,
  class TEXT,
  thumbnail_url TEXT,
  serial INTEGER,
  objekt_id TEXT,
  deleted_at TIMESTAMP
);

CREATE INDEX trade_post_have_trade_post_id_idx ON trade_post_have(trade_post_id);
CREATE INDEX trade_post_have_collection_id_idx ON trade_post_have(collection_id);

CREATE TABLE trade_post_want (
  id SERIAL PRIMARY KEY,
  trade_post_id TEXT NOT NULL REFERENCES trade_post(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL,
  collection_no TEXT,
  member TEXT,
  season TEXT,
  class TEXT,
  thumbnail_url TEXT,
  is_any BOOLEAN NOT NULL DEFAULT FALSE,
  artist TEXT,
  deleted_at TIMESTAMP
);

CREATE INDEX trade_post_want_trade_post_id_idx ON trade_post_want(trade_post_id);
CREATE INDEX trade_post_want_collection_id_idx ON trade_post_want(collection_id);

CREATE TABLE trade_notification (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  trade_post_id TEXT,
  active_trade_id TEXT,
  message TEXT NOT NULL,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX trade_notification_user_id_idx ON trade_notification(user_id);
CREATE INDEX trade_notification_user_dismissed_idx ON trade_notification(user_id, dismissed);

CREATE TABLE cosmo_token (
  id SERIAL PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE active_trade (
  id TEXT PRIMARY KEY,
  trade_post_id TEXT REFERENCES trade_post(id) ON DELETE SET NULL,
  matched_trade_post_id TEXT REFERENCES trade_post(id) ON DELETE SET NULL,
  initiator_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  counter_offer_to_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP,
  acceptance_block INTEGER,
  expires_at TIMESTAMP,
  resolved_by_trade_id TEXT
);

CREATE INDEX active_trade_initiator_idx ON active_trade(initiator_user_id);
CREATE INDEX active_trade_recipient_idx ON active_trade(recipient_user_id);
CREATE INDEX active_trade_status_idx ON active_trade(status);

ALTER TABLE trade_notification
  ADD CONSTRAINT trade_notification_active_trade_id_fk
  FOREIGN KEY (active_trade_id) REFERENCES active_trade(id) ON DELETE SET NULL;

ALTER TABLE active_trade
  ADD CONSTRAINT active_trade_counter_offer_to_id_fk
  FOREIGN KEY (counter_offer_to_id) REFERENCES active_trade(id) ON DELETE SET NULL;

ALTER TABLE active_trade
  ADD CONSTRAINT active_trade_resolved_by_trade_id_fk
  FOREIGN KEY (resolved_by_trade_id) REFERENCES active_trade(id) ON DELETE SET NULL;

CREATE TABLE active_trade_side (
  id SERIAL PRIMARY KEY,
  active_trade_id TEXT NOT NULL REFERENCES active_trade(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  objekt_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  collection_no TEXT,
  member TEXT,
  serial INTEGER,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  owner_at_acceptance TEXT,
  transfer_hash TEXT,
  detected_at TIMESTAMP
);

CREATE INDEX active_trade_side_trade_idx ON active_trade_side(active_trade_id);
CREATE INDEX active_trade_side_user_idx ON active_trade_side(user_id);

CREATE TABLE trade_transfer_log (
  id SERIAL PRIMARY KEY,
  active_trade_id TEXT NOT NULL REFERENCES active_trade(id) ON DELETE CASCADE,
  active_trade_side_id INTEGER REFERENCES active_trade_side(id) ON DELETE CASCADE,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  objekt_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  collection_no TEXT,
  member TEXT,
  serial INTEGER,
  sender_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  detected_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX trade_transfer_log_trade_idx ON trade_transfer_log(active_trade_id);

CREATE TABLE trade_message (
  id SERIAL PRIMARY KEY,
  active_trade_id TEXT NOT NULL REFERENCES active_trade(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX trade_message_trade_idx ON trade_message(active_trade_id);

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
