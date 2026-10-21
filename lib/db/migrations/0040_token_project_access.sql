ALTER TABLE "api_tokens" ADD COLUMN "project_ids" jsonb;
--> statement-breakpoint
-- Label deletion used to need only labels:write. Keep every existing token able
-- to do what it could before; new tokens get labels:delete only when asked.
UPDATE "api_tokens" SET "scopes" = "scopes" || '["labels:delete"]'::jsonb WHERE "scopes" @> '["labels:write"]'::jsonb AND NOT "scopes" @> '["labels:delete"]'::jsonb;
