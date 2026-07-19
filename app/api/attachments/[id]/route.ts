import { Readable } from "node:stream";

import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireTaskAccess } from "@/lib/db/access";
import { attachments } from "@/lib/db/schema";
import { BUCKET, ensureBucket, s3 } from "@/lib/storage";

async function accessibleAttachment(userId: string, attachmentId: string) {
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, attachmentId));
  if (!attachment || !(await requireTaskAccess(userId, attachment.taskId))) {
    return undefined;
  }
  return attachment;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await accessibleAttachment(user.id, id);
  if (!attachment) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await ensureBucket();
  // Object keys are prefixed with the *uploader's* id, not the requester's.
  const object = await s3.getObject(BUCKET, `${attachment.userId}/${attachment.id}`);

  return new Response(Readable.toWeb(object) as ReadableStream, {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
      "Content-Length": String(attachment.size),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await accessibleAttachment(user.id, id);
  if (!attachment) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await ensureBucket();
  try {
    await s3.removeObject(BUCKET, `${attachment.userId}/${attachment.id}`);
  } catch (error) {
    console.error("removeObject failed", error);
    return Response.json({ error: "Delete failed" }, { status: 500 });
  }

  await db.delete(attachments).where(eq(attachments.id, id));

  return Response.json({ ok: true });
}
