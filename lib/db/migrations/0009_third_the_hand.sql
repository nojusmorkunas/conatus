ALTER TABLE "users" ADD COLUMN "ical_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ical_token_unique" UNIQUE("ical_token");