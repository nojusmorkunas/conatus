import { desc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { requireUser } from "@/lib/auth/session";
import { todayInTimezone } from "@/lib/dates";
import { db } from "@/lib/db";
import { comments, labels, projects, sections, taskLabels, tasks, users } from "@/lib/db/schema";
import { parseTodoistImportSource } from "@/lib/todoist-upload";

export const runtime = "nodejs";

function uniqueName(base: string, usedNames: Set<string>): string {
  if (!usedNames.has(base.toLowerCase())) return base;
  const imported = `${base} (Todoist import)`;
  if (!usedNames.has(imported.toLowerCase())) return imported;
  for (let number = 2; number < 10_000; number++) {
    const candidate = `${base} (Todoist import ${number})`;
    if (!usedNames.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error(`Could not create a unique name for ${base}.`);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await request.formData();
    const selectedValue = form.get("selectedProjectIds");
    const recurrenceDatesValue = form.get("recurrenceDueDates");
    const conflictPolicy = form.get("conflictPolicy");
    if (typeof selectedValue !== "string") {
      return Response.json({ error: "No projects were selected." }, { status: 400 });
    }
    if (conflictPolicy !== "rename" && conflictPolicy !== "skip") {
      return Response.json({ error: "Choose how to handle existing project names." }, { status: 400 });
    }
    const selectedJson: unknown = JSON.parse(selectedValue);
    if (!Array.isArray(selectedJson) || !selectedJson.every((value) => typeof value === "string")) {
      return Response.json({ error: "The project selection is invalid." }, { status: 400 });
    }
    const selectedIds = new Set(selectedJson);
    if (selectedIds.size === 0 || selectedIds.size > 500) {
      return Response.json({ error: "Select between 1 and 500 projects." }, { status: 400 });
    }
    let recurrenceDueDates: Record<string, string> = {};
    if (typeof recurrenceDatesValue === "string") {
      const parsed: unknown = JSON.parse(recurrenceDatesValue);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every(isCalendarDate)
      ) {
        return Response.json({ error: "One reviewed recurring date is invalid." }, { status: 400 });
      }
      recurrenceDueDates = parsed as Record<string, string>;
    }

    const [settings] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const parsedProjects = await parseTodoistImportSource(
      form,
      todayInTimezone(settings?.timezone ?? "UTC"),
    );
    const knownIds = new Set(parsedProjects.map((project) => project.sourceId));
    if ([...selectedIds].some((id) => !knownIds.has(id))) {
      return Response.json({ error: "The selected backup no longer matches the preview." }, { status: 400 });
    }

    const selectedProjects = parsedProjects.filter((project) => selectedIds.has(project.sourceId));
    const validReviewKeys = new Set<string>();
    for (const project of selectedProjects) {
      for (const task of project.tasks) {
        if (task.recurrence && !task.dueDate) {
          const reviewKey = `${project.sourceId}:${task.key}`;
          validReviewKeys.add(reviewKey);
          const reviewedDate = recurrenceDueDates[reviewKey];
          if (!reviewedDate) {
            return Response.json(
              { error: `Enter the current Todoist date for “${task.content}” before importing.` },
              { status: 400 },
            );
          }
          if (task.recurrenceEndDate && reviewedDate > task.recurrenceEndDate) {
            return Response.json(
              { error: `The current date for “${task.content}” is after its recurrence end date.` },
              { status: 400 },
            );
          }
          task.dueDate = reviewedDate;
        }
      }
    }
    if (Object.keys(recurrenceDueDates).some((key) => !validReviewKeys.has(key))) {
      return Response.json({ error: "The reviewed dates no longer match this backup." }, { status: 400 });
    }
    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: projects.id, name: projects.name, isInbox: projects.isInbox })
        .from(projects)
        .where(eq(projects.userId, user.id));
      const usedNames = new Set(existing.map((project) => project.name.toLowerCase()));
      const inboxProject = existing.find((project) => project.isInbox);
      if (!inboxProject) throw new Error("Your Conatus Inbox could not be found.");
      const [lastProject] = await tx
        .select({ order: projects.order })
        .from(projects)
        .where(eq(projects.userId, user.id))
        .orderBy(desc(projects.order))
        .limit(1);
      let previousProjectOrder = lastProject?.order ?? null;
      const counts = {
        projects: 0,
        sections: 0,
        tasks: 0,
        comments: 0,
        labels: 0,
        renamed: 0,
        skipped: 0,
      };

      const existingLabels = await tx
        .select({ id: labels.id, name: labels.name, order: labels.order })
        .from(labels)
        .where(eq(labels.userId, user.id))
        .orderBy(labels.order);
      const labelIds = new Map(existingLabels.map((label) => [label.name.toLowerCase(), label.id]));
      let previousLabelOrder = existingLabels.at(-1)?.order ?? null;
      const createdProjectIds = new Map<string, { id: string; depth: number }>();

      // The API can return children before parents. A stable parent-first pass
      // preserves hierarchy whenever the selected parent is also imported.
      const pending = [...selectedProjects];
      const orderedProjects: typeof selectedProjects = [];
      while (pending.length > 0) {
        const readyIndex = pending.findIndex((project) =>
          !project.parentSourceId ||
          !selectedIds.has(project.parentSourceId) ||
          orderedProjects.some((candidate) => candidate.sourceId === project.parentSourceId),
        );
        orderedProjects.push(...pending.splice(readyIndex < 0 ? 0 : readyIndex, 1));
      }

      for (const sourceProject of orderedProjects) {
        // Todoist's Inbox is a system project, not a user-created project.
        // Preserve that meaning by merging it into the user's Conatus Inbox.
        const isTodoistInbox = sourceProject.isInbox || sourceProject.name.toLowerCase() === "inbox";
        if (isTodoistInbox) {
          createdProjectIds.set(sourceProject.sourceId, { id: inboxProject.id, depth: 1 });
        }
        const conflict = !isTodoistInbox && usedNames.has(sourceProject.name.toLowerCase());
        if (!isTodoistInbox && conflict && conflictPolicy === "skip") {
          counts.skipped++;
          continue;
        }
        const name = conflict ? uniqueName(sourceProject.name, usedNames) : sourceProject.name;
        if (!isTodoistInbox && name !== sourceProject.name) counts.renamed++;
        let destinationProjectId = inboxProject.id;
        if (!isTodoistInbox) {
          usedNames.add(name.toLowerCase());
          const projectOrder = generateKeyBetween(previousProjectOrder, null);
          previousProjectOrder = projectOrder;
          const [createdProject] = await tx
            .insert(projects)
            .values({
              userId: user.id,
              name,
              color: "gray",
              order: projectOrder,
              parentId: sourceProject.parentSourceId
                ? createdProjectIds.get(sourceProject.parentSourceId)?.depth !== 3
                  ? createdProjectIds.get(sourceProject.parentSourceId)?.id ?? null
                  : null
                : null,
              isFavorite: false,
              isArchived: false,
            })
            .returning({ id: projects.id });
          destinationProjectId = createdProject.id;
          counts.projects++;
          const importedParent = sourceProject.parentSourceId
            ? createdProjectIds.get(sourceProject.parentSourceId)
            : undefined;
          createdProjectIds.set(sourceProject.sourceId, {
            id: destinationProjectId,
            depth: importedParent && importedParent.depth < 3 ? importedParent.depth + 1 : 1,
          });
        }

        const sectionIds = new Map<string, string>();
        let previousSectionOrder: string | null = null;
        for (const sourceSection of sourceProject.sections) {
          const sectionOrder = generateKeyBetween(previousSectionOrder, null);
          previousSectionOrder = sectionOrder;
          const [createdSection] = await tx
            .insert(sections)
            .values({
              projectId: destinationProjectId,
              name: sourceSection.name,
              order: sectionOrder,
            })
            .returning({ id: sections.id });
          sectionIds.set(sourceSection.key, createdSection.id);
          counts.sections++;
        }

        const taskIds = new Map<string, string>();
        const previousTaskOrder = new Map<string, string>();
        for (const sourceTask of sourceProject.tasks) {
          const parentId = sourceTask.parentKey ? taskIds.get(sourceTask.parentKey) ?? null : null;
          const sectionId = sourceTask.sectionKey ? sectionIds.get(sourceTask.sectionKey) ?? null : null;
          const containerKey = `${sectionId ?? "root"}:${parentId ?? "root"}`;
          const order = generateKeyBetween(previousTaskOrder.get(containerKey) ?? null, null);
          previousTaskOrder.set(containerKey, order);
          const [createdTask] = await tx
            .insert(tasks)
            .values({
              userId: user.id,
              projectId: destinationProjectId,
              sectionId,
              parentId,
              content: sourceTask.content,
              description: sourceTask.description,
              priority: sourceTask.priority,
              dueDate: sourceTask.dueDate,
              dueTime: sourceTask.dueTime,
              recurrence: sourceTask.recurrence,
              recurrenceEndDate: sourceTask.recurrenceEndDate,
              deadlineDate: sourceTask.deadlineDate,
              durationMinutes: sourceTask.durationMinutes,
              order,
            })
            .returning({ id: tasks.id });
          taskIds.set(sourceTask.key, createdTask.id);
          counts.tasks++;

          const importedLabelIds: string[] = [];
          for (const sourceLabel of sourceTask.labels) {
            const normalized = sourceLabel.trim();
            if (!normalized) continue;
            const key = normalized.toLowerCase();
            let labelId = labelIds.get(key);
            if (!labelId) {
              const order = generateKeyBetween(previousLabelOrder, null);
              previousLabelOrder = order;
              const [createdLabel] = await tx.insert(labels).values({
                userId: user.id,
                name: normalized,
                color: "gray",
                order,
              }).returning({ id: labels.id });
              labelId = createdLabel.id;
              labelIds.set(key, labelId);
              counts.labels++;
            }
            importedLabelIds.push(labelId);
          }
          if (importedLabelIds.length > 0) {
            await tx.insert(taskLabels).values(
              [...new Set(importedLabelIds)].map((labelId) => ({ taskId: createdTask.id, labelId })),
            );
          }
        }

        const commentValues = sourceProject.comments.map((comment) => ({
          userId: user.id,
          projectId: comment.taskKey ? null : destinationProjectId,
          taskId: comment.taskKey ? taskIds.get(comment.taskKey) ?? null : null,
          content: comment.content,
        })).filter((comment) => Boolean(comment.projectId) !== Boolean(comment.taskId));
        if (commentValues.length > 0) {
          await tx.insert(comments).values(commentValues);
          counts.comments += commentValues.length;
        }
      }
      return counts;
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The import failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
