import type { PendingChange, TaskEntity } from "./types";

// The three-way merge behind silent sync. Each queued change remembers the values it replaced
// (its base). When the server's version arrives, a field the server left at the base takes the
// local value; a field both sides changed to different values is a conflict for the user.

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export const sameJson = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

/** A task field by its name in the API. Labels compare as a set. */
export function field(task: TaskEntity, name: string): Json {
  switch (name) {
    case "content":
    case "description":
    case "priority":
    case "dueDate":
    case "dueTime":
    case "deadlineDate":
    case "durationMinutes":
    case "recurrence":
    case "recurrenceEndDate":
    case "projectId":
    case "sectionId":
    case "parentId":
      return task[name];
    case "labelIds":
      return [...task.labelIds].sort();
    case "completed":
      return task.isCompleted;
    default:
      throw new Error(`Unknown task field ${name}`);
  }
}

export function withField(task: TaskEntity, name: string, value: Json): TaskEntity {
  const text = typeof value === "string" ? value : null;
  switch (name) {
    case "content":
      return { ...task, content: text ?? task.content };
    case "description":
      return { ...task, description: text ?? "" };
    case "priority":
      return { ...task, priority: typeof value === "number" ? value : task.priority };
    case "dueDate":
    case "deadlineDate":
    case "dueTime":
    case "recurrence":
    case "recurrenceEndDate":
    case "sectionId":
    case "parentId":
      return { ...task, [name]: text };
    case "durationMinutes":
      return { ...task, durationMinutes: typeof value === "number" ? value : null };
    case "labelIds":
      return { ...task, labelIds: (value as string[]).map(String) };
    case "completed": {
      const done = typeof value === "boolean" ? value : task.isCompleted;
      return { ...task, isCompleted: done, completedAt: done ? (task.completedAt ?? new Date().toISOString()) : null };
    }
    case "projectId":
      return { ...task, projectId: text ?? task.projectId };
    default:
      return task;
  }
}

/** The current values of [fields], as the base of a change about to be made. */
export const baseFor = (task: TaskEntity, fields: Iterable<string>): JsonObject =>
  Object.fromEntries([...fields].map((name) => [name, field(task, name)]));

export const withFields = (task: TaskEntity, values: JsonObject): TaskEntity =>
  Object.entries(values).reduce((next, [name, value]) => withField(next, name, value), task);

export const jsonObjectOf = (text: string | null): JsonObject => (text ? (JSON.parse(text) as JsonObject) : {});

/** The server's version with the local queued changes on top, and what both sides changed differently. */
export type Merged = { task: TaskEntity; conflicts: JsonObject };

export function merge(local: TaskEntity, theirs: TaskEntity, queued: PendingChange[]): Merged {
  // A field changed twice here is compared against what it was before the first change.
  const bases = new Map<string, Json>();
  for (const change of [...queued].sort((a, b) => a.seq - b.seq)) {
    for (const [name, value] of Object.entries(jsonObjectOf(change.base))) if (!bases.has(name)) bases.set(name, value);
  }
  const conflicts: JsonObject = {};
  let task = theirs;
  for (const [name, base] of bases) {
    const ours = field(local, name);
    const other = field(theirs, name);
    if (!sameJson(other, base) && !sameJson(other, ours)) conflicts[name] = other;
    // The local value stays on screen, conflicting or not, until the user decides.
    task = withField(task, name, ours);
  }
  return { task, conflicts };
}
