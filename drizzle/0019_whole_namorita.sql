CREATE TABLE "active_trade" (
	"id" text PRIMARY KEY NOT NULL,
	"trade_post_id" text,
	"matched_trade_post_id" text,
	"initiator_user_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"counter_offer_to_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"acceptance_block" integer,
	"expires_at" timestamp,
	"resolved_by_trade_id" text
);
--> statement-breakpoint
CREATE TABLE "active_trade_side" (
	"id" serial PRIMARY KEY NOT NULL,
	"active_trade_id" text NOT NULL,
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
	"owner_at_acceptance" text,
	"transfer_hash" text,
	"detected_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "poster" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"edit_token" text,
	"created_by_ip" text,
	"version" integer DEFAULT 1 NOT NULL,
	"username" text,
	"cosmo_id" text,
	"notes" text,
	"have_title" text DEFAULT 'Have' NOT NULL,
	"want_title" text DEFAULT 'Want' NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"group_by_member" boolean DEFAULT false NOT NULL,
	"group_by_numbers" boolean DEFAULT true NOT NULL,
	"cols_per_row" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poster_have" (
	"id" serial PRIMARY KEY NOT NULL,
	"poster_id" text NOT NULL,
	"collection_id" text,
	"collection_no" text,
	"member" text,
	"season" text,
	"class" text,
	"thumbnail_url" text,
	"serial" integer,
	"objekt_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"freeform" boolean DEFAULT false NOT NULL,
	"raw_label" text,
	"on_offline" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poster_want" (
	"id" serial PRIMARY KEY NOT NULL,
	"poster_id" text NOT NULL,
	"collection_id" text,
	"collection_no" text,
	"member" text,
	"season" text,
	"class" text,
	"thumbnail_url" text,
	"serial" integer,
	"objekt_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"freeform" boolean DEFAULT false NOT NULL,
	"raw_label" text,
	"on_offline" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_ban" (
	"id" serial PRIMARY KEY NOT NULL,
	"cosmo_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"active_trade_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"lifted_at" timestamp,
	"lifted_reason" text
);
--> statement-breakpoint
CREATE TABLE "trade_notification" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"trade_post_id" text,
	"active_trade_id" text,
	"message" text NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_transfer_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"active_trade_id" text NOT NULL,
	"active_trade_side_id" integer,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"objekt_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"collection_no" text,
	"member" text,
	"serial" integer,
	"sender_user_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"event" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cosmo_account" ALTER COLUMN "nickname" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_post" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "trade_post_have" ALTER COLUMN "trade_post_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "trade_post_want" ALTER COLUMN "trade_post_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cosmo_token" ADD COLUMN "access_token" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cosmo_token" ADD COLUMN "refresh_token" text NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_post" ADD COLUMN "wants_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_post_have" ADD COLUMN "collection_no" text;--> statement-breakpoint
ALTER TABLE "trade_post_have" ADD COLUMN "serial" integer;--> statement-breakpoint
ALTER TABLE "trade_post_have" ADD COLUMN "objekt_id" text;--> statement-breakpoint
ALTER TABLE "trade_post_have" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "trade_post_want" ADD COLUMN "collection_no" text;--> statement-breakpoint
ALTER TABLE "trade_post_want" ADD COLUMN "is_any" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_post_want" ADD COLUMN "artist" text;--> statement-breakpoint
ALTER TABLE "trade_post_want" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "discord_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "discord_username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "trade_offer_quota" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_trade_post_id_trade_post_id_fk" FOREIGN KEY ("trade_post_id") REFERENCES "public"."trade_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_matched_trade_post_id_trade_post_id_fk" FOREIGN KEY ("matched_trade_post_id") REFERENCES "public"."trade_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_initiator_user_id_user_id_fk" FOREIGN KEY ("initiator_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_counter_offer_to_id_active_trade_id_fk" FOREIGN KEY ("counter_offer_to_id") REFERENCES "public"."active_trade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_trade" ADD CONSTRAINT "active_trade_resolved_by_trade_id_active_trade_id_fk" FOREIGN KEY ("resolved_by_trade_id") REFERENCES "public"."active_trade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_trade_side" ADD CONSTRAINT "active_trade_side_active_trade_id_active_trade_id_fk" FOREIGN KEY ("active_trade_id") REFERENCES "public"."active_trade"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_trade_side" ADD CONSTRAINT "active_trade_side_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster" ADD CONSTRAINT "poster_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_have" ADD CONSTRAINT "poster_have_poster_id_poster_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."poster"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_want" ADD CONSTRAINT "poster_want_poster_id_poster_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."poster"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_ban" ADD CONSTRAINT "trade_ban_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_ban" ADD CONSTRAINT "trade_ban_active_trade_id_active_trade_id_fk" FOREIGN KEY ("active_trade_id") REFERENCES "public"."active_trade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_notification" ADD CONSTRAINT "trade_notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_notification" ADD CONSTRAINT "trade_notification_active_trade_id_active_trade_id_fk" FOREIGN KEY ("active_trade_id") REFERENCES "public"."active_trade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_transfer_log" ADD CONSTRAINT "trade_transfer_log_active_trade_id_active_trade_id_fk" FOREIGN KEY ("active_trade_id") REFERENCES "public"."active_trade"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_transfer_log" ADD CONSTRAINT "trade_transfer_log_active_trade_side_id_active_trade_side_id_fk" FOREIGN KEY ("active_trade_side_id") REFERENCES "public"."active_trade_side"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_transfer_log" ADD CONSTRAINT "trade_transfer_log_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_transfer_log" ADD CONSTRAINT "trade_transfer_log_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "active_trade_initiator_idx" ON "active_trade" USING btree ("initiator_user_id");--> statement-breakpoint
CREATE INDEX "active_trade_recipient_idx" ON "active_trade" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "active_trade_status_idx" ON "active_trade" USING btree ("status");--> statement-breakpoint
CREATE INDEX "active_trade_side_trade_idx" ON "active_trade_side" USING btree ("active_trade_id");--> statement-breakpoint
CREATE INDEX "active_trade_side_user_idx" ON "active_trade_side" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "poster_user_id_idx" ON "poster" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "poster_have_poster_id_idx" ON "poster_have" USING btree ("poster_id");--> statement-breakpoint
CREATE INDEX "poster_want_poster_id_idx" ON "poster_want" USING btree ("poster_id");--> statement-breakpoint
CREATE INDEX "trade_ban_cosmo_id_idx" ON "trade_ban" USING btree ("cosmo_id");--> statement-breakpoint
CREATE INDEX "trade_ban_user_id_idx" ON "trade_ban" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trade_notification_user_id_idx" ON "trade_notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trade_notification_user_dismissed_idx" ON "trade_notification" USING btree ("user_id","dismissed");--> statement-breakpoint
CREATE INDEX "trade_transfer_log_trade_idx" ON "trade_transfer_log" USING btree ("active_trade_id");--> statement-breakpoint
CREATE INDEX "trade_post_user_id_idx" ON "trade_post" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trade_post_status_created_idx" ON "trade_post" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "trade_post_have_trade_post_id_idx" ON "trade_post_have" USING btree ("trade_post_id");--> statement-breakpoint
CREATE INDEX "trade_post_have_collection_id_idx" ON "trade_post_have" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "trade_post_want_trade_post_id_idx" ON "trade_post_want" USING btree ("trade_post_id");--> statement-breakpoint
CREATE INDEX "trade_post_want_collection_id_idx" ON "trade_post_want" USING btree ("collection_id");--> statement-breakpoint
ALTER TABLE "cosmo_token" DROP COLUMN "user_session";--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_discord_id_unique" UNIQUE("discord_id");