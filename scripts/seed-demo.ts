import { and, eq, ne } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

import { createUserWithInboxUsing } from "../lib/auth/create-user";
import { hashPassword } from "../lib/auth/password";
import { db } from "../lib/db";
import {
  comments,
  filters,
  labels,
  projectCollaborators,
  projects,
  reminders,
  sections,
  taskLabels,
  tasks,
  users,
} from "../lib/db/schema";
import { parseFilter } from "../lib/filter";
import { parseRecurrence } from "../lib/recurrence";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Project = typeof projects.$inferSelect;
type TaskInput = Omit<typeof tasks.$inferInsert, "userId" | "order"> & {
  labels?: string[];
};

const username = process.env.SEED_USERNAME ?? "admin";
const password = process.env.SEED_PASSWORD ?? "admin12345";
// A non-UTC default keeps the seed honest: "today" is resolved in the user's
// zone everywhere, so a UTC-only fixture hides off-by-one-day bugs.
const timezone = process.env.SEED_TIMEZONE ?? "Europe/Amsterdam";

function dateInTimezone(timezone: string, offsetDays = 0): string {
  const instant = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function atOffset(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

function increasingKeys() {
  let previous: string | null = null;
  return () => {
    previous = generateKeyBetween(previous, null);
    return previous;
  };
}

function validRecurrence(text: string): string {
  const rule = parseRecurrence(text);
  if (!rule) throw new Error(`Invalid seed recurrence: ${text}`);
  return rule;
}

function validFilter(query: string): string {
  const result = parseFilter(query);
  if ("error" in result) throw new Error(`Invalid seed filter "${query}": ${result.error}`);
  return query;
}

async function seed(tx: Tx) {
  let [owner] = await tx.select().from(users).where(eq(users.username, username)).limit(1);
  const createdOwner = !owner;
  if (!owner) {
    const created = await createUserWithInboxUsing(tx, {
      username,
      passwordHash: await hashPassword(password),
      timezone,
      instanceRole: "admin",
    });
    // A seeded workspace is already set up, so skip the first-run wizard that
    // would otherwise intercept every route until it is completed.
    [owner] = await tx
      .update(users)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(users.id, created.id))
      .returning();
  }

  // A second account so the shared project, its collaborator comment and the
  // assigned tasks below are actually reachable. Without one, every
  // collaboration path in this seed quietly degrades to a solo workspace.
  let [bob] = await tx.select().from(users).where(eq(users.username, "bob")).limit(1);
  if (!bob) {
    const created = await createUserWithInboxUsing(tx, {
      username: "bob",
      passwordHash: await hashPassword(password),
      timezone,
    });
    [bob] = await tx
      .update(users)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(users.id, created.id))
      .returning();
  }
  const owned = await tx.select().from(projects).where(eq(projects.userId, owner.id));
  const inbox = owned.find((project) => project.isInbox);
  if (!inbox) throw new Error(`User ${username} has no inbox project.`);

  let roadmap = owned.find((project) => project.name === "Team Roadmap" && !project.isInbox);
  const preservedIds = [inbox.id, ...(roadmap ? [roadmap.id] : [])];

  await tx.delete(comments).where(and(eq(comments.userId, owner.id), eq(comments.projectId, inbox.id)));
  await tx.delete(tasks).where(and(eq(tasks.userId, owner.id), eq(tasks.projectId, inbox.id)));
  if (roadmap) {
    await tx.delete(comments).where(eq(comments.projectId, roadmap.id));
    await tx.delete(tasks).where(eq(tasks.projectId, roadmap.id));
    await tx.delete(sections).where(eq(sections.projectId, roadmap.id));
  }
  await tx.delete(projects).where(
    and(eq(projects.userId, owner.id), ne(projects.id, inbox.id), ...(roadmap ? [ne(projects.id, roadmap.id)] : [])),
  );
  await tx.delete(labels).where(eq(labels.userId, owner.id));
  await tx.delete(filters).where(eq(filters.userId, owner.id));

  const projectOrder = increasingKeys();
  // Advance past the preserved inbox; every newly generated key is strictly increasing.
  projectOrder();
  const createdProjects: Project[] = [];
  async function addProject(
    values: Pick<Project, "name" | "icon" | "color" | "isFavorite"> &
      Partial<Pick<Project, "isArchived" | "deletedAt">> & { parentId?: string },
  ) {
    const [project] = await tx.insert(projects).values({
      userId: owner.id,
      order: projectOrder(),
      ...values,
    }).returning();
    createdProjects.push(project);
    return project;
  }

  const work = await addProject({ name: "Work", icon: "work", color: "blue", isFavorite: true });
  const website = await addProject({ name: "Website Redesign", icon: "creative", color: "purple", isFavorite: true, parentId: work.id });
  const planning = await addProject({ name: "Q3 Planning", icon: "goals", color: "indigo", isFavorite: false, parentId: work.id });
  const personal = await addProject({ name: "Personal", icon: "health", color: "green", isFavorite: true });
  const home = await addProject({ name: "Home", icon: "home", color: "orange", isFavorite: false });
  const reading = await addProject({ name: "Reading List", icon: "learning", color: "amber", isFavorite: false });
  // Archived and trashed projects: neither shows in the sidebar, and both have
  // their own recovery path, so seeding them keeps those screens non-empty.
  const retro = await addProject({ name: "2025 Retrospective", icon: "goals", color: "gray", isFavorite: false, isArchived: true });
  await addProject({ name: "Scrapped Campaign", icon: "creative", color: "gray", isFavorite: false, deletedAt: atOffset(-48) });

  if (!roadmap) {
    roadmap = await addProject({ name: "Team Roadmap", icon: "launch", color: "red", isFavorite: true });
  } else {
    const [updated] = await tx.update(projects).set({
      icon: "launch", color: "red", isFavorite: true, isArchived: false,
    }).where(eq(projects.id, roadmap.id)).returning();
    roadmap = updated;
  }
  if (bob) {
    await tx.insert(projectCollaborators).values({ projectId: roadmap.id, userId: bob.id })
      .onConflictDoNothing();
  }

  const sectionMap = new Map<string, string>();
  let sectionCount = 0;
  async function addSections(project: Project, names: string[]) {
    const nextOrder = increasingKeys();
    for (const name of names) {
      const [section] = await tx.insert(sections).values({
        projectId: project.id, name, order: nextOrder(),
      }).returning();
      sectionMap.set(`${project.name}/${name}`, section.id);
      sectionCount++;
    }
  }
  await addSections(website, ["Backlog", "In Progress", "Review", "Done"]);
  await addSections(planning, ["Ideas", "Drafting", "Approved"]);
  await addSections(roadmap, ["Next up", "In flight", "Shipped"]);
  await addSections(home, ["This weekend", "Someday"]);

  const labelOrder = increasingKeys();
  const labelRows = await tx.insert(labels).values([
    { userId: owner.id, name: "urgent", color: "red", isFavorite: true, order: labelOrder() },
    { userId: owner.id, name: "deep-work", color: "purple", isFavorite: true, order: labelOrder() },
    { userId: owner.id, name: "quick-win", color: "green", isFavorite: false, order: labelOrder() },
    { userId: owner.id, name: "waiting", color: "amber", isFavorite: false, order: labelOrder() },
    { userId: owner.id, name: "meeting", color: "blue", isFavorite: false, order: labelOrder() },
    { userId: owner.id, name: "errands", color: "orange", isFavorite: false, order: labelOrder() },
  ]).returning();
  const labelIds = new Map(labelRows.map((label) => [label.name, label.id]));

  const d = (offset: number) => dateInTimezone(owner.timezone || "UTC", offset);
  const taskOrders = new Map<string, ReturnType<typeof increasingKeys>>();
  const taskRows = new Map<string, typeof tasks.$inferSelect>();
  let taskLabelCount = 0;
  async function addTask(input: TaskInput) {
    const { labels: names = [], ...values } = input;
    const parent = values.parentId
      ? [...taskRows.values()].find((task) => task.id === values.parentId)
      : null;
    const taskValues = values.parentId
      ? { ...values, sectionId: parent?.sectionId ?? null }
      : values;
    const sibling = `${taskValues.projectId}:${taskValues.sectionId ?? "none"}:${taskValues.parentId ?? "root"}`;
    const nextOrder = taskOrders.get(sibling) ?? increasingKeys();
    taskOrders.set(sibling, nextOrder);
    const [task] = await tx.insert(tasks).values({ userId: owner.id, order: nextOrder(), ...taskValues }).returning();
    taskRows.set(task.content, task);
    if (names.length) {
      await tx.insert(taskLabels).values(names.map((name) => ({
        taskId: task.id,
        labelId: labelIds.get(name)!,
      })));
      taskLabelCount += names.length;
    }
    return task;
  }
  const sec = (project: Project, name: string) => sectionMap.get(`${project.name}/${name}`)!;
  const done = (daysAgo: number) => ({ isCompleted: true, completedAt: atOffset(-daysAgo * 24) });

  await addTask({ projectId: inbox.id, content: "Reply to the venue proposal", description: "Confirm headcount and ask about the vegetarian menu.", priority: 1, dueDate: d(-2), dueTime: "09:00", labels: ["urgent", "quick-win"] });
  await addTask({ projectId: inbox.id, content: "Book dentist appointment", priority: 2, dueDate: d(0), dueTime: "11:30", durationMinutes: 15, labels: ["quick-win"] });
  await addTask({ projectId: inbox.id, content: "Capture ideas from product podcast", priority: 4, labels: ["deep-work"] });
  await addTask({ projectId: website.id, sectionId: sec(website, "Backlog"), content: "Audit current navigation", description: "List dead ends, duplicate destinations and mobile pain points.", priority: 2, dueDate: d(-1), deadlineDate: d(2), durationMinutes: 90, labels: ["deep-work", "urgent"] });
  const prototype = await addTask({ projectId: website.id, sectionId: sec(website, "In Progress"), content: "Build responsive homepage prototype", description: "Cover desktop, tablet and 390px mobile layouts.", priority: 1, dueDate: d(0), dueTime: "10:00", deadlineDate: d(3), durationMinutes: 180, labels: ["deep-work", "urgent"] });
  await addTask({ projectId: website.id, sectionId: sec(website, "Review"), content: "Review homepage copy with marketing", priority: 2, dueDate: d(1), dueTime: "14:00", durationMinutes: 45, labels: ["meeting", "waiting"] });
  await addTask({ projectId: website.id, sectionId: sec(website, "Backlog"), content: "Compress hero imagery", priority: 3, dueDate: d(4), durationMinutes: 30, labels: ["quick-win"] });
  await addTask({ projectId: website.id, sectionId: sec(website, "Done"), content: "Document design tokens", priority: 3, dueDate: d(-8), labels: ["deep-work"], ...done(7) });
  await addTask({ parentId: prototype.id, content: "Add mobile navigation states", projectId: website.id, priority: 2, dueDate: d(0), durationMinutes: 60 });
  await addTask({ parentId: prototype.id, projectId: website.id, content: "Check keyboard focus order", priority: 1, dueDate: d(1), labels: ["urgent"] });
  await addTask({ parentId: prototype.id, projectId: website.id, content: "Prepare stakeholder preview link", priority: 3, dueDate: d(1), labels: ["quick-win"] });
  await addTask({ projectId: planning.id, sectionId: sec(planning, "Ideas"), content: "Collect customer themes from Q2", priority: 2, dueDate: d(2), durationMinutes: 120, labels: ["deep-work"] });
  await addTask({ projectId: planning.id, sectionId: sec(planning, "Drafting"), content: "Draft Q3 objectives", priority: 1, dueDate: d(5), deadlineDate: d(8), durationMinutes: 150, labels: ["deep-work", "urgent"] });
  await addTask({ projectId: planning.id, sectionId: sec(planning, "Approved"), content: "Publish planning calendar", priority: 3, dueDate: d(-5), labels: ["quick-win"], ...done(4) });
  await addTask({ projectId: personal.id, content: "Morning stretch and mobility", priority: 3, dueDate: d(0), dueTime: "07:30", recurrence: validRecurrence("every day"), durationMinutes: 20, labels: ["quick-win"] });
  await addTask({ projectId: personal.id, content: "Weekly meal planning", priority: 3, dueDate: d(2), recurrence: validRecurrence("every monday"), durationMinutes: 45 });
  await addTask({ projectId: personal.id, content: "Call Mum", priority: 2, dueDate: d(1), dueTime: "19:00", recurrence: validRecurrence("every 2 weeks"), durationMinutes: 30 });
  await addTask({ projectId: personal.id, content: "Renew gym membership", priority: 2, dueDate: d(7), deadlineDate: d(10), labels: ["errands"] });
  await addTask({ projectId: personal.id, content: "Run 5 km before breakfast", priority: 3, dueDate: d(-10), durationMinutes: 35, ...done(10) });
  const shelves = await addTask({ projectId: home.id, sectionId: sec(home, "This weekend"), content: "Install hallway shelves", description: "Use the oak boards in the storage room; wall plugs are in the red toolbox.", priority: 2, dueDate: d(3), deadlineDate: d(6), durationMinutes: 120, labels: ["errands"] });
  await addTask({ projectId: home.id, sectionId: sec(home, "This weekend"), parentId: shelves.id, content: "Measure and mark bracket positions", priority: 3, dueDate: d(2), durationMinutes: 25 });
  await addTask({ projectId: home.id, sectionId: sec(home, "This weekend"), parentId: shelves.id, content: "Pick up wall anchors", priority: 2, dueDate: d(1), labels: ["errands", "quick-win"] });
  await addTask({ projectId: home.id, sectionId: sec(home, "Someday"), content: "Plan balcony herb garden", priority: 4, dueDate: d(9), durationMinutes: 60 });
  await addTask({ projectId: home.id, content: "Take recycling outside", priority: 4, dueDate: d(0), recurrence: validRecurrence("every weekday"), labels: ["quick-win"] });
  await addTask({ projectId: home.id, content: "Replace kitchen tap washer", priority: 2, dueDate: d(-12), labels: ["errands"], ...done(12) });
  await addTask({ projectId: reading.id, content: "Read Designing Data-Intensive Applications", description: "Finish chapter 5 and capture notes on replication trade-offs.", priority: 3, dueDate: d(8), durationMinutes: 75, labels: ["deep-work"] });
  await addTask({ projectId: reading.id, content: "Review saved accessibility articles", priority: 4, dueDate: d(4), durationMinutes: 40 });
  await addTask({ projectId: reading.id, content: "Finish The Creative Act", priority: 4, dueDate: d(-6), ...done(6) });
  const kickoff = await addTask({ projectId: roadmap.id, sectionId: sec(roadmap, "Next up"), content: "Prepare mobile beta kickoff", priority: 1, dueDate: d(1), dueTime: "09:30", deadlineDate: d(4), durationMinutes: 60, assigneeId: bob?.id, labels: ["meeting", "urgent"] });
  await addTask({ projectId: roadmap.id, sectionId: sec(roadmap, "In flight"), content: "Validate offline sync edge cases", description: "Test reconnect conflict handling on iOS and Android.", priority: 1, dueDate: d(0), durationMinutes: 120, assigneeId: bob?.id, labels: ["deep-work", "urgent"] });
  await addTask({ projectId: roadmap.id, sectionId: sec(roadmap, "In flight"), content: "Share weekly release update", priority: 3, dueDate: d(2), recurrence: validRecurrence("every week"), durationMinutes: 30, labels: ["meeting"] });
  await addTask({ projectId: roadmap.id, sectionId: sec(roadmap, "Next up"), content: "Triage beta feedback", priority: 2, dueDate: d(6), assigneeId: bob?.id, labels: ["waiting"] });
  await addTask({ projectId: roadmap.id, sectionId: sec(roadmap, "Shipped"), content: "Enable feature flags in staging", priority: 2, dueDate: d(-3), assigneeId: bob?.id, ...done(3) });
  await addTask({ projectId: roadmap.id, sectionId: sec(roadmap, "Shipped"), content: "Approve analytics event taxonomy", priority: 3, dueDate: d(-9), ...done(9) });
  await addTask({ projectId: work.id, content: "Clear weekly expense report", priority: 3, dueDate: d(-1), ...done(1) });
  await addTask({ projectId: work.id, content: "Send project status summary", priority: 2, dueDate: d(-2), ...done(2) });
  await addTask({ projectId: personal.id, content: "Sort travel photos", priority: 4, dueDate: d(-13), ...done(13) });
  await addTask({ projectId: inbox.id, content: "Return library books", priority: 3, dueDate: d(-4), labels: ["errands"], ...done(4) });

  // Overdue recurring tasks. Completing one advances it to a future date
  // rather than ticking it off, which is the branch that only appears once a
  // repeat has been missed — every other recurring row above is due today or
  // later and never reaches it.
  await addTask({ projectId: personal.id, content: "Water the plants", priority: 3, dueDate: d(-4), recurrence: validRecurrence("every 3 days"), durationMinutes: 10, labels: ["quick-win"] });
  await addTask({ projectId: home.id, content: "Take the bins to the kerb", priority: 2, dueDate: d(-2), dueTime: "07:00", recurrence: validRecurrence("every monday"), labels: ["errands"] });
  // "every!" restarts the interval from the completion day instead of stepping
  // from the old due date, so an overdue one lands on a different date than
  // the plain rule above would.
  await addTask({ projectId: personal.id, content: "Descale the coffee machine", priority: 4, dueDate: d(-6), recurrence: validRecurrence("every! 3 days"), durationMinutes: 20 });
  // Monthly rules clamp to short months instead of drifting off the anchor day.
  await addTask({ projectId: work.id, content: "Submit the monthly timesheet", priority: 1, dueDate: d(0), recurrence: validRecurrence("every last day"), durationMinutes: 20, labels: ["urgent"] });
  await addTask({ projectId: work.id, content: "Reconcile the office invoice", priority: 2, dueDate: d(3), recurrence: validRecurrence("every 15th"), durationMinutes: 30 });
  // Repeat end dates. The standup's next step falls past its end date, so
  // completing it completes the task for real; the checkpoint still has room
  // to advance.
  await addTask({ projectId: planning.id, sectionId: sec(planning, "Approved"), content: "Daily standup until launch", priority: 2, dueDate: d(0), dueTime: "09:15", recurrence: validRecurrence("every day"), recurrenceEndDate: d(0), durationMinutes: 15, labels: ["meeting"] });
  await addTask({ projectId: planning.id, sectionId: sec(planning, "Approved"), content: "Weekly launch checkpoint", priority: 2, dueDate: d(1), recurrence: validRecurrence("every week"), recurrenceEndDate: d(28), durationMinutes: 30, labels: ["meeting"] });

  // Archived projects keep their tasks; unarchiving has to bring them back.
  await addTask({ projectId: retro.id, content: "Summarise 2025 delivery highlights", priority: 3, dueDate: d(-40), ...done(38) });
  await addTask({ projectId: retro.id, content: "Archive the old roadmap board", priority: 4, dueDate: d(-35), ...done(34) });

  // Soft-deleted tasks so Trash and the restore endpoints have something to
  // act on. The subtask goes with its parent, which is what the delete route
  // does rather than letting the database cascade it away.
  const cancelled = await addTask({ projectId: home.id, sectionId: sec(home, "Someday"), content: "Cancel the old storage unit", priority: 3, dueDate: d(-3), labels: ["errands"], deletedAt: atOffset(-6) });
  await addTask({ projectId: home.id, sectionId: sec(home, "Someday"), parentId: cancelled.id, content: "Photograph what is still in there", priority: 4, deletedAt: atOffset(-6) });
  await addTask({ projectId: reading.id, content: "Skim the abandoned newsletter draft", priority: 4, deletedAt: atOffset(-30) });

  const filterOrder = increasingKeys();
  const filterRows = await tx.insert(filters).values([
    { userId: owner.id, name: "Priority 1", query: validFilter("p1"), order: filterOrder(), isFavorite: true },
    { userId: owner.id, name: "Overdue", query: validFilter("overdue"), order: filterOrder(), isFavorite: true },
    { userId: owner.id, name: "Urgent work", query: validFilter("@urgent & p1"), order: filterOrder(), isFavorite: true },
    { userId: owner.id, name: "Next 7 days", query: validFilter("7 days"), order: filterOrder(), isFavorite: false },
  ]).returning();

  const audit = taskRows.get("Audit current navigation")!;
  const review = taskRows.get("Review homepage copy with marketing")!;
  await tx.insert(comments).values([
    { taskId: prototype.id, userId: owner.id, content: "The first responsive pass is ready. Please focus on the menu transition." },
    { taskId: kickoff.id, userId: owner.id, content: "Agenda draft is in the description; add any platform-specific risks." },
    { taskId: audit.id, userId: owner.id, content: "Found three duplicate destinations and two dead-end mobile flows." },
    { taskId: review.id, userId: bob?.id ?? owner.id, content: "I can review this before lunch tomorrow." },
    { projectId: roadmap.id, userId: owner.id, content: "Use this project for cross-platform launch decisions and weekly updates." },
    ...(bob ? [{ projectId: roadmap.id, userId: bob.id, content: "I added the Android beta risks to the kickoff checklist." }] : []),
  ]);

  await tx.insert(reminders).values([
    { userId: owner.id, taskId: prototype.id, remindAt: atOffset(-1) },
    { userId: owner.id, taskId: kickoff.id, remindAt: atOffset(4) },
    { userId: owner.id, taskId: shelves.id, remindAt: atOffset(30), seenAt: atOffset(-2) },
  ]);

  // Attachments are intentionally not seeded because they require real S3/MinIO objects.
  return {
    user: owner.username,
    password: createdOwner ? password : "unchanged (the account already existed)",
    collaborator: bob ? bob.username : `not found (collaboration data used ${owner.username} only)`,
    projects: createdProjects.length + preservedIds.length,
    sections: sectionCount,
    tasks: taskRows.size,
    completedTasks: [...taskRows.values()].filter((task) => task.isCompleted).length,
    trashedTasks: [...taskRows.values()].filter((task) => task.deletedAt).length,
    recurringTasks: [...taskRows.values()].filter((task) => task.recurrence).length,
    labels: labelRows.length,
    taskLabels: taskLabelCount,
    filters: filterRows.length,
    comments: bob ? 6 : 5,
    reminders: 3,
  };
}

async function main() {
  const summary = await db.transaction(seed);
  console.log("Demo data seeded successfully:");
  for (const [key, value] of Object.entries(summary)) console.log(`  ${key}: ${value}`);
}

main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(`Demo seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
