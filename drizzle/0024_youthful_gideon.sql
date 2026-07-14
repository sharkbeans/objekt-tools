CREATE TABLE "trade_match_seen" (
	"id" serial PRIMARY KEY NOT NULL,
	"notified_trade_post_id" text NOT NULL,
	"matched_trade_post_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_match_seen" ADD CONSTRAINT "trade_match_seen_notified_trade_post_id_trade_post_id_fk" FOREIGN KEY ("notified_trade_post_id") REFERENCES "public"."trade_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_match_seen" ADD CONSTRAINT "trade_match_seen_matched_trade_post_id_trade_post_id_fk" FOREIGN KEY ("matched_trade_post_id") REFERENCES "public"."trade_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trade_match_seen_pair_unique" ON "trade_match_seen" USING btree ("notified_trade_post_id","matched_trade_post_id");