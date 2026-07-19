import { desc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { labels } from "@/lib/db/schema";
import { labelCreateSchema } from "@/lib/validation";

export async function GET() {
  const user = await requireUser("labels:read");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userLabels = await db
    .select()
    .from(labels)
    .where(eq(labels.userId, user.id))
    .orderBy(labels.order);

  return Response.json(userLabels);
}

export async function POST(request: Request) {
  const user = await requireUser("labels:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = labelCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const [last] = await db
    .select({ order: labels.order })
    .from(labels)
    .where(eq(labels.userId, user.id))
    .orderBy(desc(labels.order))
    .limit(1);

  const [label] = await db
    .insert(labels)
    .values({
      userId: user.id,
      name: parsed.data.name,
      color: parsed.data.color,
      order: generateKeyBetween(last?.order ?? null, null),
    })
    .returning();

  return Response.json(label, { status: 201 });
}
