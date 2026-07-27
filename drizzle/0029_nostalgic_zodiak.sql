CREATE TABLE "cosmo_user_cache" (
	"address" text PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"cosmo_id" integer,
	"last_cosmo_check" timestamp DEFAULT now() NOT NULL
);
