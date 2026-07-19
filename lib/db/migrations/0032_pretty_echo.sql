ALTER TABLE "projects" ADD COLUMN "favorite_order" text;
--> statement-breakpoint
UPDATE "projects" SET "favorite_order" = "order" WHERE "is_favorite" = true;
