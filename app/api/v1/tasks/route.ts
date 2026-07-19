import { and, desc, eq, gte, ilike, inArray, lt, lte, or, type SQL } from "drizzle-orm";

import { POST as createTask } from "@/app/api/tasks/route";
import { withIdempotency } from "@/lib/api/idempotency";
import { requireApiActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjectIds } from "@/lib/db/access";
import { labels, tasks, taskLabels } from "@/lib/db/schema";
import { withCommentCounts, withLabels } from "@/lib/db/task-labels";
import { escapeLike } from "@/lib/search";

type Cursor = { updatedAt: string; id: string };

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed?.updatedAt !== "string" ||
      Number.isNaN(Date.parse(parsed.updatedAt)) ||
      typeof parsed?.id !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const actor = await requireApiActor("tasks:read");
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;
  const cursorValue = url.searchParams.get("cursor");
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) {
    return Response.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const accessibleIds = await accessibleProjectIds(actor.id);
  if (!accessibleIds.length) {
    return Response.json({ items: [], nextCursor: null });
  }

  const conditions: SQL[] = [inArray(tasks.projectId, accessibleIds)];
  const projectId = url.searchParams.get("projectId");
  const sectionId = url.searchParams.get("sectionId");
  const parentId = url.searchParams.get("parentId");
  const completed = url.searchParams.get("completed");
  const priority = url.searchParams.get("priority");
  const dueBefore = url.searchParams.get("dueBefore");
  const dueAfter = url.searchParams.get("dueAfter");
  const query = url.searchParams.get("query")?.trim();
  const labelId = url.searchParams.get("labelId");

  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (sectionId) conditions.push(eq(tasks.sectionId, sectionId));
  if (parentId) conditions.push(eq(tasks.parentId, parentId));
  if (completed === "true" || completed === "false") {
    conditions.push(eq(tasks.isCompleted, completed === "true"));
  }
  if (priority && /^[1-4]$/.test(priority)) {
    conditions.push(eq(tasks.priority, Number(priority)));
  }
  if (dueBefore) conditions.push(lte(tasks.dueDate, dueBefore));
  if (dueAfter) conditions.push(gte(tasks.dueDate, dueAfter));
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(or(ilike(tasks.content, pattern), ilike(tasks.description, pattern))!);
  }
  if (labelId) {
    const [ownedLabel] = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.id, labelId), eq(labels.userId, actor.id)))
      .limit(1);
    if (!ownedLabel) return Response.json({ error: "Not found" }, { status: 404 });
    const matchingLinks = await db
      .select({ taskId: taskLabels.taskId })
      .from(taskLabels)
      .where(eq(taskLabels.labelId, labelId));
    if (!matchingLinks.length) return Response.json({ items: [], nextCursor: null });
    conditions.push(inArray(tasks.id, matchingLinks.map((link) => link.taskId)));
  }
  if (cursor) {
    const cursorDate = new Date(cursor.updatedAt);
    conditions.push(
      or(
        lt(tasks.updatedAt, cursorDate),
        and(eq(tasks.updatedAt, cursorDate), lt(tasks.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.updatedAt), desc(tasks.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const enriched = await withCommentCounts(await withLabels(page, actor.id));
  const last = page.at(-1);

  return Response.json({
    items: enriched,
    nextCursor:
      hasMore && last
        ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id })
        : null,
  });
}

export async function POST(request: Request) {
  const actor = await requireApiActor("tasks:write");
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return withIdempotency(
    request,
    { userId: actor.id, operation: "tasks.create" },
    () => createTask(request),
  );
}
