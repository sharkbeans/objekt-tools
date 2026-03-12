ALTER TABLE "trade_post_want" ADD COLUMN "is_any" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "trade_post_want" ADD COLUMN "artist" text;
