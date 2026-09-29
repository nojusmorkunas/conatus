import {
  and,
  desc,
  eq,
  getTableColumns,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { withCommentCounts, withLabels } from "@/lib/db/task-labels";

export type CompletedTasksCursor = { completedAt: Date; id: string };

const completedTasksCursorSchema = z.object({
  completedAt: z.iso.datetime(),
  id: z.uuid(),
});

function encodeCompletedTasksCursor(cursor: CompletedTasksCursor) {
  return Buffer.from(
    JSON.stringify({
      completedAt: cursor.completedAt.toISOString(),
      id: cursor.id,
    }),
  ).toString("base64url");
}

export function decodeCompletedTasksCursor(
  value: string,
): CompletedTasksCursor | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded).toString("base64url") !== value) return null;

    const parsed = completedTasksCursorSchema.safeParse(JSON.parse(decoded));
    if (!parsed.success) return null;

    return {
      completedAt: new Date(parsed.data.completedAt),
      id: parsed.data.id,
    };
  } catch {
    return null;
  }
}

export async function loadProjectTasks(
  projectId: string,
  userId: string,
  includeTaskId?: string,
) {
  const parent = alias(tasks, "parent");
  const parsedIncludeTaskId = z.uuid().safeParse(includeTaskId);

  const rows = await db
    .select(getTableColumns(tasks))
    .from(tasks)
    .leftJoin(parent, eq(parent.id, tasks.parentId))
    .where(
      and(
        eq(tasks.projectId, projectId),
        isNull(tasks.deletedAt),
        or(
          eq(tasks.isCompleted, false),
          and(eq(tasks.isCompleted, true), eq(parent.isCompleted, false)),
          parsedIncludeTaskId.success
            ? eq(tasks.id, parsedIncludeTaskId.data)
            : undefined,
        ),
      ),
    )
    .orderBy(tasks.order);

  return withCommentCounts(await withLabels(rows, userId));
}

export async function loadCompletedTasksPage(
  projectId: string,
  userId: string,
  sectionId: string | null,
  cursor: CompletedTasksCursor | null,
  limit = 20,
) {
  const rows = await db
    .select(getTableColumns(tasks))
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        isNull(tasks.deletedAt),
        eq(tasks.isCompleted, true),
        isNull(tasks.parentId),
        sectionId ? eq(tasks.sectionId, sectionId) : isNull(tasks.sectionId),
        cursor
          ? or(
              lt(tasks.completedAt, cursor.completedAt),
              and(
                eq(tasks.completedAt, cursor.completedAt),
                lt(tasks.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(tasks.completedAt), desc(tasks.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await withCommentCounts(await withLabels(page, userId));
  const last = page.at(-1);

  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeCompletedTasksCursor({
            completedAt: last.completedAt!,
            id: last.id,
          })
        : null,
  };
}
