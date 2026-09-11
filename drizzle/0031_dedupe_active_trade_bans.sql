-- Collapse duplicate active bans before a unique index can exist to prevent them.
--
-- `issueBan` guarded against double-banning with a read-then-insert, which two
-- concurrent callers pass together — the daily expiry cron racing a
-- check-transfers call is enough. The duplicate mattered because `tryLiftBan`
-- lifted one row: fulfilling your obligations cleared the first ban and left
-- the second, and the user stayed banned with nothing left to do about it.
--
-- Keeps the earliest ban per (user, trade) — it is the one whose id any
-- notification already refers to — and lifts the rest rather than deleting
-- them, so the history of what happened survives.
UPDATE "trade_ban" AS dup
SET "lifted_at" = now(),
    "lifted_reason" = 'duplicate of an earlier ban for the same trade'
WHERE "lifted_at" IS NULL
  AND "active_trade_id" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "trade_ban" AS keep
    WHERE keep."user_id" = dup."user_id"
      AND keep."active_trade_id" = dup."active_trade_id"
      AND keep."lifted_at" IS NULL
      AND (keep."created_at", keep."id") < (dup."created_at", dup."id")
  );
