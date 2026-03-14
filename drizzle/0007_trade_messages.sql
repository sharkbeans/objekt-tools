CREATE TABLE "trade_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"active_trade_id" text NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "trade_message_trade_idx" ON "trade_message" USING btree ("active_trade_id");

ALTER TABLE "trade_message" ADD CONSTRAINT "trade_message_active_trade_id_active_trade_id_fk" FOREIGN KEY ("active_trade_id") REFERENCES "public"."active_trade"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "trade_message" ADD CONSTRAINT "trade_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
