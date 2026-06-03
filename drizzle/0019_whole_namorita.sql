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
ALTER TABLE "poster" ADD CONSTRAINT "poster_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poster_have" ADD CONSTRAINT "poster_have_poster_id_poster_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."poster"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poster_want" ADD CONSTRAINT "poster_want_poster_id_poster_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."poster"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "poster_user_id_idx" ON "poster" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "poster_have_poster_id_idx" ON "poster_have" USING btree ("poster_id");
--> statement-breakpoint
CREATE INDEX "poster_want_poster_id_idx" ON "poster_want" USING btree ("poster_id");
