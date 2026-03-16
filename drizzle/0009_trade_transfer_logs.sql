CREATE TABLE IF NOT EXISTS "trade_transfer_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"active_trade_id" text NOT NULL REFERENCES "active_trade"("id") ON DELETE CASCADE,
	"active_trade_side_id" integer NOT NULL REFERENCES "active_trade_side"("id") ON DELETE CASCADE,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"objekt_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"collection_no" text,
	"member" text,
	"serial" integer,
	"sender_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"recipient_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"event" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "trade_transfer_log_trade_idx" ON "trade_transfer_log" ("active_trade_id");
