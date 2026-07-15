ALTER TABLE "poster" ADD COLUMN "wants_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "poster_want" ADD COLUMN "is_any" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "poster_want" ADD COLUMN "artist" text;