import { eq } from "drizzle-orm";

import { requireApiActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjects } from "@/lib/db/access";
import { users } from "@/lib/db/schema";
import { todayInTimezone } from "@/lib/dates";

export async function GET() {
  const actor = await requireApiActor("tasks:read");
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [[user], projects] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        timezone: users.timezone,
        dateFormat: users.dateFormat,
        weekStart: users.weekStart,
      })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1),
    accessibleProjects(actor.id),
  ]);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({
    apiVersion: "v1",
    serverTime: new Date().toISOString(),
    today: todayInTimezone(user.timezone),
    user,
    inbox: projects.find((project) => project.isInbox) ?? null,
    grantedScopes: actor.scopes,
  });
}
