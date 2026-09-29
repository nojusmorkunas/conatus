import { z } from "zod";

import { notFound, unauthorized } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/db/access";
import {
  decodeCompletedTasksCursor,
  loadCompletedTasksPage,
} from "@/lib/db/project-tasks";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("tasks:read");
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await requireProjectAccess(user.id, id))) return notFound();

  const searchParams = new URL(request.url).searchParams;
  const sectionIdValue = searchParams.get("sectionId");
  const parsedSectionId = sectionIdValue
    ? z.uuid().safeParse(sectionIdValue)
    : null;
  if (parsedSectionId && !parsedSectionId.success) {
    return Response.json({ error: "Invalid sectionId" }, { status: 400 });
  }

  const cursorValue = searchParams.get("cursor");
  const cursor = cursorValue
    ? decodeCompletedTasksCursor(cursorValue)
    : null;
  if (cursorValue !== null && !cursor) {
    return Response.json({ error: "Invalid cursor" }, { status: 400 });
  }

  return Response.json(
    await loadCompletedTasksPage(
      id,
      user.id,
      parsedSectionId?.success ? parsedSectionId.data : null,
      cursor,
    ),
  );
}
