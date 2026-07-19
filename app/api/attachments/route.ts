import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireTaskAccess } from "@/lib/db/access";
import { attachments } from "@/lib/db/schema";
import { BUCKET, ensureBucket, s3 } from "@/lib/storage";

const MAX_SIZE = 10 * 1024 * 1024;

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  if (!(await requireTaskAccess(user.id, taskId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const taskAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.taskId, taskId))
    .orderBy(attachments.createdAt);

  return Response.json(taskAttachments);
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const taskId = form.get("taskId");
  const file = form.get("file");
  if (typeof taskId !== "string" || !(file instanceof File)) {
    return Response.json({ error: "taskId and file are required" }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "File exceeds 10MB limit" }, { status: 413 });
  }

  if (!(await requireTaskAccess(user.id, taskId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const [attachment] = await db
    .insert(attachments)
    .values({
      taskId,
      userId: user.id,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    })
    .returning();

  await ensureBucket();
  const buffer = Buffer.from(await file.arrayBuffer());
  await s3.putObject(BUCKET, `${user.id}/${attachment.id}`, buffer, buffer.length, {
    "Content-Type": attachment.contentType,
  });

  return Response.json(attachment, { status: 201 });
}
