ALTER TABLE "trade_post" ADD COLUMN "expires_at" timestamp NOT NULL DEFAULT (NOW() + INTERVAL '7 days');
