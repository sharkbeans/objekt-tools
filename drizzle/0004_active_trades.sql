CREATE TABLE "active_trade" (
	"id" serial PRIMARY KEY NOT NULL,
	"trade_post_id" integer,
	"matched_trade_post_id" integer,
	"initiator_user_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "active_trade_side" (
	"id" serial PRIMARY KEY NOT NULL,
	"active_trade_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"recipient_address" text NOT NULL,
	"objekt_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"collection_no" text,
	"member" text,
	"serial" integer,
	"thumbnail_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"transfer_hash" text,
	"detected_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_trade_post_id_trade_post_id_fk" FOREIGN KEY ("trade_post_id") REFERENCES "public"."trade_post"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_matched_trade_post_id_trade_post_id_fk" FOREIGN KEY ("matched_trade_post_id") REFERENCES "public"."trade_post"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_initiator_user_id_user_id_fk" FOREIGN KEY ("initiator_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "active_trade_side" ADD CONSTRAINT "active_trade_side_active_trade_id_active_trade_id_fk" FOREIGN KEY ("active_trade_id") REFERENCES "public"."active_trade"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "active_trade_side" ADD CONSTRAINT "active_trade_side_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "active_trade_initiator_idx" ON "active_trade" USING btree ("initiator_user_id");
--> statement-breakpoint
CREATE INDEX "active_trade_recipient_idx" ON "active_trade" USING btree ("recipient_user_id");
--> statement-breakpoint
CREATE INDEX "active_trade_status_idx" ON "active_trade" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "active_trade_side_trade_idx" ON "active_trade_side" USING btree ("active_trade_id");
--> statement-breakpoint
CREATE INDEX "active_trade_side_user_idx" ON "active_trade_side" USING btree ("user_id");
