CREATE INDEX "trade_post_have_member_idx" ON "trade_post_have" USING btree ("member");--> statement-breakpoint
CREATE INDEX "trade_post_have_season_idx" ON "trade_post_have" USING btree ("season");--> statement-breakpoint
CREATE INDEX "trade_post_have_class_idx" ON "trade_post_have" USING btree ("class");--> statement-breakpoint
CREATE INDEX "trade_post_want_member_idx" ON "trade_post_want" USING btree ("member");--> statement-breakpoint
CREATE INDEX "trade_post_want_season_idx" ON "trade_post_want" USING btree ("season");--> statement-breakpoint
CREATE INDEX "trade_post_want_class_idx" ON "trade_post_want" USING btree ("class");--> statement-breakpoint
CREATE INDEX "trade_post_want_artist_idx" ON "trade_post_want" USING btree ("artist");