import { eq } from "drizzle-orm";

import { unauthorized } from "@/lib/api/responses";
import { requireApiActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjects } from "@/lib/db/access";
import { users } from "@/lib/db/schema";
import { todayInTimezone } from "@/lib/dates";
import { isEmailConfigured } from "@/lib/mailer";

export async function GET() {
  const actor = await requireApiActor("tasks:read");
  if (!actor) return unauthorized();

  const [[user], projects] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        timezone: users.timezone,
        dateFormat: users.dateFormat,
        weekStart: users.weekStart,
        emailReminders: users.emailReminders,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1),
    accessibleProjects(actor),
  ]);
  if (!user) return unauthorized();
  // Apps hide the email reminder switch when the server can't send one: no
  // SMTP, or no address to send it to. The address itself stays private.
  const { email, ...profile } = user;

  return Response.json({
    apiVersion: "v1",
    serverTime: new Date().toISOString(),
    today: todayInTimezone(user.timezone),
    user: { ...profile, emailRemindersAvailable: isEmailConfigured() && Boolean(email) },
    inbox: projects.find((project) => project.isInbox) ?? null,
    grantedScopes: actor.scopes,
  });
}
