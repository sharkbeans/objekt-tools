CREATE INDEX "trade_post_user_id_idx" ON "trade_post" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trade_post_status_created_idx" ON "trade_post" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "trade_post_have_trade_post_id_idx" ON "trade_post_have" USING btree ("trade_post_id");--> statement-breakpoint
CREATE INDEX "trade_post_have_collection_id_idx" ON "trade_post_have" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "trade_post_want_trade_post_id_idx" ON "trade_post_want" USING btree ("trade_post_id");--> statement-breakpoint
CREATE INDEX "trade_post_want_collection_id_idx" ON "trade_post_want" USING btree ("collection_id");
