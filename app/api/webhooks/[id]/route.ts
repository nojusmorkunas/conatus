import { and, eq } from "drizzle-orm";

import { invalid, notFound, unauthorized } from "@/lib/api/responses";
import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { webhooks } from "@/lib/db/schema";
import { webhookUpdateSchema } from "@/lib/validation";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const [deleted] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, user.id)))
    .returning({ id: webhooks.id });

  if (!deleted) return notFound();
  return Response.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSessionUser();
  if (!user) return unauthorized();

  const parsed = webhookUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return invalid(parsed.error);
  }

  const { id } = await params;
  const [webhook] = await db
    .update(webhooks)
    .set({
      isActive: parsed.data.isActive,
      ...(parsed.data.isActive ? { failureCount: 0 } : {}),
    })
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, user.id)))
    .returning({
      id: webhooks.id,
      url: webhooks.url,
      isActive: webhooks.isActive,
      failureCount: webhooks.failureCount,
      createdAt: webhooks.createdAt,
    });

  if (!webhook) return notFound();
  return Response.json(webhook);
}
