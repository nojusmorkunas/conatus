CREATE INDEX "tasks_project_completed_idx" ON "tasks" USING btree ("project_id","is_completed","completed_at" DESC NULLS LAST,"id");
--> statement-breakpoint
UPDATE "tasks" SET "completed_at" = date_trunc('milliseconds', "updated_at") WHERE "is_completed" = true AND "completed_at" IS NULL;
