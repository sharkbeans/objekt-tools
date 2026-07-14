ALTER TABLE "trade_post" ADD COLUMN "availability_checked_at" timestamp;
--> statement-breakpoint
CREATE INDEX "trade_post_status_availability_checked_idx" ON "trade_post" USING btree ("status","availability_checked_at");
