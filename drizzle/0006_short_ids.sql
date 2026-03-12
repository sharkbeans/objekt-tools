-- Migration: Change trade_post and active_trade IDs from serial (integer) to text (6-char nanoid)
-- This migration clears all trade data since prod is not yet in use.

-- 1. Drop dependent rows first (FK constraints)
DELETE FROM "active_trade_side";
DELETE FROM "active_trade";
DELETE FROM "trade_notification";
DELETE FROM "trade_post_want";
DELETE FROM "trade_post_have";
DELETE FROM "trade_post";

-- 2. Drop foreign key constraints referencing trade_post.id and active_trade.id
ALTER TABLE "trade_post_have" DROP CONSTRAINT "trade_post_have_trade_post_id_trade_post_id_fk";
ALTER TABLE "trade_post_want" DROP CONSTRAINT "trade_post_want_trade_post_id_trade_post_id_fk";
ALTER TABLE "trade_notification" DROP CONSTRAINT IF EXISTS "trade_notification_trade_post_id_trade_post_id_fk";
ALTER TABLE "active_trade" DROP CONSTRAINT "active_trade_trade_post_id_trade_post_id_fk";
ALTER TABLE "active_trade" DROP CONSTRAINT "active_trade_matched_trade_post_id_trade_post_id_fk";
ALTER TABLE "active_trade_side" DROP CONSTRAINT "active_trade_side_active_trade_id_active_trade_id_fk";

-- 3. Change trade_post.id from serial to text
ALTER TABLE "trade_post" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "trade_post" ALTER COLUMN "id" SET DATA TYPE text USING id::text;
DROP SEQUENCE IF EXISTS "trade_post_id_seq";

-- 4. Change active_trade.id from serial to text
ALTER TABLE "active_trade" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "active_trade" ALTER COLUMN "id" SET DATA TYPE text USING id::text;
DROP SEQUENCE IF EXISTS "active_trade_id_seq";

-- 5. Change FK columns from integer to text
ALTER TABLE "trade_post_have" ALTER COLUMN "trade_post_id" SET DATA TYPE text;
ALTER TABLE "trade_post_want" ALTER COLUMN "trade_post_id" SET DATA TYPE text;
ALTER TABLE "trade_notification" ALTER COLUMN "trade_post_id" SET DATA TYPE text;
ALTER TABLE "active_trade" ALTER COLUMN "trade_post_id" SET DATA TYPE text;
ALTER TABLE "active_trade" ALTER COLUMN "matched_trade_post_id" SET DATA TYPE text;
ALTER TABLE "active_trade_side" ALTER COLUMN "active_trade_id" SET DATA TYPE text;

-- 6. Re-add foreign key constraints
ALTER TABLE "trade_post_have" ADD CONSTRAINT "trade_post_have_trade_post_id_trade_post_id_fk" FOREIGN KEY ("trade_post_id") REFERENCES "trade_post"("id") ON DELETE CASCADE;
ALTER TABLE "trade_post_want" ADD CONSTRAINT "trade_post_want_trade_post_id_trade_post_id_fk" FOREIGN KEY ("trade_post_id") REFERENCES "trade_post"("id") ON DELETE CASCADE;
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_trade_post_id_trade_post_id_fk" FOREIGN KEY ("trade_post_id") REFERENCES "trade_post"("id") ON DELETE SET NULL;
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_matched_trade_post_id_trade_post_id_fk" FOREIGN KEY ("matched_trade_post_id") REFERENCES "trade_post"("id") ON DELETE SET NULL;
ALTER TABLE "active_trade_side" ADD CONSTRAINT "active_trade_side_active_trade_id_active_trade_id_fk" FOREIGN KEY ("active_trade_id") REFERENCES "active_trade"("id") ON DELETE CASCADE;
