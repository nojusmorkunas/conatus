import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";

import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { webhooks } from "@/lib/db/schema";
import { webhookCreateSchema } from "@/lib/validation";

export async function GET() {
  const user = await requireSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const endpoints = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      isActive: webhooks.isActive,
      failureCount: webhooks.failureCount,
      createdAt: webhooks.createdAt,
    })
    .from(webhooks)
    .where(eq(webhooks.userId, user.id))
    .orderBy(desc(webhooks.createdAt));

  return Response.json(endpoints);
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = webhookCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const secret = randomBytes(24).toString("base64url");
  const [webhook] = await db
    .insert(webhooks)
    .values({ userId: user.id, url: parsed.data.url, secret })
    .returning({ id: webhooks.id, url: webhooks.url });

  return Response.json({ ...webhook, secret }, { status: 201 });
}
