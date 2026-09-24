CREATE TABLE "hunt" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"nickname" text NOT NULL,
	"member" text NOT NULL,
	"season" text NOT NULL,
	"edition" integer NOT NULL,
	"mode" text NOT NULL,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hunt" ADD CONSTRAINT "hunt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hunt_user_grid_unique" ON "hunt" USING btree ("user_id","member","season","edition");