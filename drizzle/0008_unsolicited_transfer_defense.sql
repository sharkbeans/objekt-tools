ALTER TABLE "active_trade" ADD COLUMN "accepted_at" timestamp;
ALTER TABLE "active_trade_side" ADD COLUMN "owner_at_acceptance" text;
