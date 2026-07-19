import { and, eq, ne } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

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

const username = process.env.SEED_USERNAME ?? "alice";

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
  const [alice] = await tx.select().from(users).where(eq(users.username, username)).limit(1);
  if (!alice) throw new Error(`No user found for ${username}. Create the account before seeding demo data.`);

  const [bob] = await tx.select().from(users).where(eq(users.username, "bob")).limit(1);
  const owned = await tx.select().from(projects).where(eq(projects.userId, alice.id));
  const inbox = owned.find((project) => project.isInbox);
  if (!inbox) throw new Error(`User ${username} has no inbox project.`);

  let roadmap = owned.find((project) => project.name === "Team Roadmap" && !project.isInbox);
  const preservedIds = [inbox.id, ...(roadmap ? [roadmap.id] : [])];

  await tx.delete(comments).where(and(eq(comments.userId, alice.id), eq(comments.projectId, inbox.id)));
  await tx.delete(tasks).where(and(eq(tasks.userId, alice.id), eq(tasks.projectId, inbox.id)));
  if (roadmap) {
    await tx.delete(comments).where(eq(comments.projectId, roadmap.id));
    await tx.delete(tasks).where(eq(tasks.projectId, roadmap.id));
    await tx.delete(sections).where(eq(sections.projectId, roadmap.id));
  }
  await tx.delete(projects).where(
    and(eq(projects.userId, alice.id), ne(projects.id, inbox.id), ...(roadmap ? [ne(projects.id, roadmap.id)] : [])),
  );
  await tx.delete(labels).where(eq(labels.userId, alice.id));
  await tx.delete(filters).where(eq(filters.userId, alice.id));

  const projectOrder = increasingKeys();
  // Advance past the preserved inbox; every newly generated key is strictly increasing.
  projectOrder();
  const createdProjects: Project[] = [];
  async function addProject(values: Pick<Project, "name" | "icon" | "color" | "isFavorite"> & { parentId?: string }) {
    const [project] = await tx.insert(projects).values({
      userId: alice.id,
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
    { userId: alice.id, name: "urgent", color: "red", isFavorite: true, order: labelOrder() },
    { userId: alice.id, name: "deep-work", color: "purple", isFavorite: true, order: labelOrder() },
    { userId: alice.id, name: "quick-win", color: "green", isFavorite: false, order: labelOrder() },
    { userId: alice.id, name: "waiting", color: "amber", isFavorite: false, order: labelOrder() },
    { userId: alice.id, name: "meeting", color: "blue", isFavorite: false, order: labelOrder() },
    { userId: alice.id, name: "errands", color: "orange", isFavorite: false, order: labelOrder() },
  ]).returning();
  const labelIds = new Map(labelRows.map((label) => [label.name, label.id]));

  const d = (offset: number) => dateInTimezone(alice.timezone || "UTC", offset);
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
    const [task] = await tx.insert(tasks).values({ userId: alice.id, order: nextOrder(), ...taskValues }).returning();
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
  await addTask({ projectId: website.id, sectionId: sec(website, "Backlog"), content: "Audit current navigation", description: "List dead ends, duplicate destinations, and mobile pain points.", priority: 2, dueDate: d(-1), deadlineDate: d(2), durationMinutes: 90, labels: ["deep-work", "urgent"] });
  const prototype = await addTask({ projectId: website.id, sectionId: sec(website, "In Progress"), content: "Build responsive homepage prototype", description: "Cover desktop, tablet, and 390px mobile layouts.", priority: 1, dueDate: d(0), dueTime: "10:00", deadlineDate: d(3), durationMinutes: 180, labels: ["deep-work", "urgent"] });
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

  const filterOrder = increasingKeys();
  const filterRows = await tx.insert(filters).values([
    { userId: alice.id, name: "Priority 1", query: validFilter("p1"), order: filterOrder(), isFavorite: true },
    { userId: alice.id, name: "Overdue", query: validFilter("overdue"), order: filterOrder(), isFavorite: true },
    { userId: alice.id, name: "Urgent work", query: validFilter("@urgent & p1"), order: filterOrder(), isFavorite: true },
    { userId: alice.id, name: "Next 7 days", query: validFilter("7 days"), order: filterOrder(), isFavorite: false },
  ]).returning();

  const audit = taskRows.get("Audit current navigation")!;
  const review = taskRows.get("Review homepage copy with marketing")!;
  await tx.insert(comments).values([
    { taskId: prototype.id, userId: alice.id, content: "The first responsive pass is ready. Please focus on the menu transition." },
    { taskId: kickoff.id, userId: alice.id, content: "Agenda draft is in the description; add any platform-specific risks." },
    { taskId: audit.id, userId: alice.id, content: "Found three duplicate destinations and two dead-end mobile flows." },
    { taskId: review.id, userId: bob?.id ?? alice.id, content: "I can review this before lunch tomorrow." },
    { projectId: roadmap.id, userId: alice.id, content: "Use this project for cross-platform launch decisions and weekly updates." },
    ...(bob ? [{ projectId: roadmap.id, userId: bob.id, content: "I added the Android beta risks to the kickoff checklist." }] : []),
  ]);

  await tx.insert(reminders).values([
    { userId: alice.id, taskId: prototype.id, remindAt: atOffset(-1) },
    { userId: alice.id, taskId: kickoff.id, remindAt: atOffset(4) },
    { userId: alice.id, taskId: shelves.id, remindAt: atOffset(30), seenAt: atOffset(-2) },
  ]);

  // Attachments are intentionally not seeded because they require real S3/MinIO objects.
  return {
    user: alice.username,
    collaborator: bob ? bob.username : "not found (collaboration data used Alice only)",
    projects: createdProjects.length + preservedIds.length,
    sections: sectionCount,
    tasks: taskRows.size,
    completedTasks: [...taskRows.values()].filter((task) => task.isCompleted).length,
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
