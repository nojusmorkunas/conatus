ALTER TABLE "users" ADD COLUMN "oidc_identity" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_oidc_identity_unique" UNIQUE("oidc_identity");