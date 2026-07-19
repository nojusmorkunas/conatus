import { desc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { filters } from "@/lib/db/schema";
import { filterCreateSchema } from "@/lib/validation";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userFilters = await db
    .select()
    .from(filters)
    .where(eq(filters.userId, user.id))
    .orderBy(filters.order);

  return Response.json(userFilters);
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = filterCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const [last] = await db
    .select({ order: filters.order })
    .from(filters)
    .where(eq(filters.userId, user.id))
    .orderBy(desc(filters.order))
    .limit(1);

  const [filter] = await db
    .insert(filters)
    .values({
      userId: user.id,
      name: parsed.data.name,
      query: parsed.data.query,
      order: generateKeyBetween(last?.order ?? null, null),
    })
    .returning();

  return Response.json(filter, { status: 201 });
}
