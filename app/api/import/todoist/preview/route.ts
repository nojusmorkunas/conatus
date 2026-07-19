import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { todayInTimezone } from "@/lib/dates";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { summarizeTodoistProject } from "@/lib/todoist-import";
import { parseTodoistImportSource } from "@/lib/todoist-upload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await request.formData();
    const [[settings], existingProjects] = await Promise.all([
      db.select({ timezone: users.timezone }).from(users).where(eq(users.id, user.id)).limit(1),
      db.select({ name: projects.name }).from(projects).where(eq(projects.userId, user.id)),
    ]);
    const parsedProjects = await parseTodoistImportSource(
      form,
      todayInTimezone(settings?.timezone ?? "UTC"),
    );
    const names = new Set(existingProjects.map((project) => project.name.toLowerCase()));
    const preview = parsedProjects.map((project) => {
      const summary = summarizeTodoistProject(project, names);
      names.add(project.name.toLowerCase());
      return summary;
    });

    return Response.json({
      projects: preview,
      totals: {
        projects: preview.length,
        sections: preview.reduce((total, project) => total + project.sections, 0),
        tasks: preview.reduce((total, project) => total + project.tasks, 0),
        comments: preview.reduce((total, project) => total + project.comments, 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The backup could not be read.";
    return Response.json({ error: message }, { status: 400 });
  }
}
