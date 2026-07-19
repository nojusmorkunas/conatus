import { eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/db/access";
import { sections } from "@/lib/db/schema";
import { sectionCreateSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await requireUser("projects:write");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = sectionCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { projectId, name, afterId } = parsed.data;

  if (!(await requireProjectAccess(user.id, projectId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const siblings = await db
    .select({ id: sections.id, order: sections.order })
    .from(sections)
    .where(eq(sections.projectId, projectId))
    .orderBy(sections.order);

  let before = siblings.at(-1)?.order ?? null;
  let after: string | null = null;

  if (afterId !== undefined) {
    let index = 0;
    if (afterId) {
      index = siblings.findIndex((section) => section.id === afterId) + 1;
      if (index === 0) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
    }
    before = siblings[index - 1]?.order ?? null;
    after = siblings[index]?.order ?? null;
  }

  const [section] = await db
    .insert(sections)
    .values({
      projectId,
      name,
      order: generateKeyBetween(before, after),
    })
    .returning();

  return Response.json(section, { status: 201 });
}
