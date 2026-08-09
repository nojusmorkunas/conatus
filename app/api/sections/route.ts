import { eq, inArray } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjectIds, requireProjectAccess } from "@/lib/db/access";
import { sections } from "@/lib/db/schema";
import { sectionCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await requireUser("projects:read");
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessibleIds = await accessibleProjectIds(user.id);
  if (!accessibleIds.length) return Response.json([]);

  // Filtering by an inaccessible project is a probe for its existence, so it
  // gets the same 404 as a project that is not there at all.
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (projectId && !accessibleIds.includes(projectId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(
    await db
      .select()
      .from(sections)
      .where(
        projectId
          ? eq(sections.projectId, projectId)
          : inArray(sections.projectId, accessibleIds),
      )
      .orderBy(sections.order),
  );
}

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
