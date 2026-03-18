ALTER TABLE "active_trade" ADD COLUMN "counter_offer_to_id" text;
--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_counter_offer_to_id_active_trade_id_fk" FOREIGN KEY ("counter_offer_to_id") REFERENCES "public"."active_trade"("id") ON DELETE set null ON UPDATE no action;
