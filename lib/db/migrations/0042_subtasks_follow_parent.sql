-- Restore descendants to their root's project and section so they remain visible.
WITH RECURSIVE tree AS (
  SELECT "id", "id" AS "root_id", "project_id", "section_id"
  FROM "tasks"
  WHERE "parent_id" IS NULL
  UNION ALL
  SELECT child."id", tree."root_id", tree."project_id", tree."section_id"
  FROM "tasks" child
  JOIN tree ON child."parent_id" = tree."id"
)
UPDATE "tasks"
SET "project_id" = tree."project_id", "section_id" = tree."section_id", "updated_at" = now()
FROM tree
WHERE "tasks"."id" = tree."id"
  AND ("tasks"."project_id" <> tree."project_id" OR "tasks"."section_id" IS DISTINCT FROM tree."section_id");
--> statement-breakpoint
-- Complete open descendants with their nearest completed ancestor's stamp so they can reopen together.
WITH RECURSIVE tree AS (
  SELECT "id", "is_completed" AS "done", "completed_at" AS "stamp"
  FROM "tasks"
  WHERE "parent_id" IS NULL
  UNION ALL
  SELECT child."id", tree."done" OR child."is_completed",
    CASE WHEN child."is_completed" THEN child."completed_at" ELSE tree."stamp" END
  FROM "tasks" child
  JOIN tree ON child."parent_id" = tree."id"
)
UPDATE "tasks"
SET "is_completed" = true, "completed_at" = tree."stamp", "updated_at" = now()
FROM tree
WHERE "tasks"."id" = tree."id" AND NOT "tasks"."is_completed" AND tree."done";
