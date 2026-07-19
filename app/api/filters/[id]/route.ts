import { and, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { filters } from "@/lib/db/schema";
import { filterUpdateSchema } from "@/lib/validation";

async function ownedFilter(userId: string, filterId: string) {
  const [filter] = await db
    .select()
    .from(filters)
    .where(and(eq(filters.id, filterId), eq(filters.userId, userId)));
  return filter;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const filter = await ownedFilter(user.id, id);
  if (!filter) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = filterUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(filters)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(filters.id, id))
    .returning();

  return Response.json(updated);
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
  const filter = await ownedFilter(user.id, id);
  if (!filter) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(filters).where(eq(filters.id, id));

  return Response.json({ ok: true });
}
