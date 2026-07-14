ALTER TABLE "trade_post" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_post" ADD COLUMN "linked_poster_id" text;--> statement-breakpoint
ALTER TABLE "trade_post" ADD CONSTRAINT "trade_post_linked_poster_id_poster_id_fk" FOREIGN KEY ("linked_poster_id") REFERENCES "public"."poster"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trade_post_linked_poster_id_unique" ON "trade_post" USING btree ("linked_poster_id");