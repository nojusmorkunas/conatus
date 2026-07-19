ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp;
-- Existing accounts have already used the product and must not be forced
-- through first-run onboarding. New rows keep the nullable default.
UPDATE "users" SET "onboarding_completed_at" = NOW();
