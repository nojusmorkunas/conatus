import { describe, expect, test } from "vitest";

import { projectEntity, taskEntity } from "@/lib/offline/fixtures";
import type { CommentEntity, ProjectEntity, TaskEntity } from "@/lib/offline/types";

import { matchComments, matchProjects, matchTasks, mergeComments, SEARCH_LIMIT, escapeLike, searchFilters, type CommentMatch } from "./search";

describe("escapeLike", () => {
  const slash = String.fromCharCode(92);

  test.each([
    ["plain text", "plain text"],
    ["100%", `100${slash}%`],
    ["under_score", `under${slash}_score`],
    [`path${slash}name`, `path${slash}${slash}name`],
    [`%_${slash}`, `${slash}%${slash}_${slash}${slash}`],
  ])("escapes %s", (value, expected) => {
    expect(escapeLike(value)).toBe(expected);
  });
});

describe("searchFilters", () => {
  const projectIds = ["a", "b"];

  test("keeps an accessible project and a known status", () => {
    expect(searchFilters({ project: "b", status: "completed" }, projectIds)).toEqual({
      project: "b",
      status: "completed",
    });
  });

  test("falls back to everything for unknown, inaccessible or repeated values", () => {
    expect(searchFilters({}, projectIds)).toEqual({ project: null, status: "all" });
    expect(searchFilters({ project: "c", status: "done" }, projectIds)).toEqual({ project: null, status: "all" });
    expect(searchFilters({ project: ["a", "b"], status: ["open"] }, projectIds)).toEqual({ project: null, status: "all" });
  });
});

const all = { project: null, status: "all" } as const;
const ids = (tasks: TaskEntity[]) => tasks.map((task) => task.id);
const tasksOf = (...rows: Partial<TaskEntity>[]) => new Map(rows.map((fields) => [fields.id!, taskEntity(fields)]));
const projectsOf = (...rows: Partial<ProjectEntity>[]) => new Map(rows.map((fields) => [fields.id!, projectEntity(fields)]));

describe("matchTasks", () => {
  const projects = projectsOf({ id: "p" }, { id: "q", name: "Work" });

  test("matches content and description, ignoring case", () => {
    const tasks = [...tasksOf({ id: "a", content: "Buy MILK" }, { id: "b", content: "Other", description: "bring milk" }, { id: "c", content: "Eggs" }).values()];
    expect(ids(matchTasks(tasks, projects, "milk", all))).toEqual(["a", "b"]);
  });

  test("leaves out Trash, archived and trashed projects", () => {
    const hidden = projectsOf({ id: "p" }, { id: "arch", isArchived: true }, { id: "gone", deletedAt: "2026-10-01T00:00:00.000Z" });
    const tasks = [
      taskEntity({ id: "live", content: "milk" }),
      taskEntity({ id: "trash", content: "milk", deletedAt: "2026-10-01T00:00:00.000Z" }),
      taskEntity({ id: "arch", projectId: "arch", content: "milk" }),
      taskEntity({ id: "gone", projectId: "gone", content: "milk" }),
    ];
    expect(ids(matchTasks(tasks, hidden, "milk", all))).toEqual(["live"]);
  });

  test("applies the project and status filters", () => {
    const tasks = [
      taskEntity({ id: "open", content: "milk" }),
      taskEntity({ id: "done", content: "milk", isCompleted: true, completedAt: "2026-10-02T00:00:00.000Z" }),
      taskEntity({ id: "work", projectId: "q", content: "milk" }),
    ];
    expect(ids(matchTasks(tasks, projects, "milk", { project: "q", status: "all" }))).toEqual(["work"]);
    expect(ids(matchTasks(tasks, projects, "milk", { project: null, status: "open" }))).toEqual(["open", "work"]);
    expect(ids(matchTasks(tasks, projects, "milk", { project: null, status: "completed" }))).toEqual(["done"]);
  });

  test("orders open tasks by due date with no date last, and completed ones newest first", () => {
    const tasks = [
      taskEntity({ id: "none", content: "milk", dueDate: null }),
      taskEntity({ id: "later", content: "milk", dueDate: "2026-10-09" }),
      taskEntity({ id: "sooner", content: "milk", dueDate: "2026-10-01" }),
      taskEntity({ id: "old", content: "milk", isCompleted: true, completedAt: "2026-10-01T00:00:00.000Z" }),
      taskEntity({ id: "new", content: "milk", isCompleted: true, completedAt: "2026-10-05T00:00:00.000Z" }),
    ];
    expect(ids(matchTasks(tasks, projects, "milk", all))).toEqual(["sooner", "later", "none", "new", "old"]);
    expect(ids(matchTasks(tasks, projects, "milk", { project: null, status: "completed" }))).toEqual(["new", "old"]);
  });

  test("stops at the search limit", () => {
    const tasks = Array.from({ length: SEARCH_LIMIT + 3 }, (_, index) => taskEntity({ id: `t${index}`, content: "milk" }));
    expect(matchTasks(tasks, projects, "milk", all)).toHaveLength(SEARCH_LIMIT);
  });
});

describe("matchProjects", () => {
  const pool = [projectEntity({ id: "a", name: "Groceries" }), projectEntity({ id: "b", name: "Home" }), projectEntity({ id: "c", name: "Grocery list", isArchived: true })];

  test("matches names, ignoring case, and skips archived ones", () => {
    expect(matchProjects(pool, "GROC", all).map((project) => project.id)).toEqual(["a"]);
  });

  test("offers nothing inside one project", () => {
    expect(matchProjects(pool, "groc", { project: "a", status: "all" })).toEqual([]);
  });
});

describe("matchComments and mergeComments", () => {
  const comment = (fields: Partial<CommentEntity>): CommentEntity => ({ id: "c", taskId: "t", projectId: null, content: "", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "", userId: null, ...fields });
  const tasks = tasksOf({ id: "t", content: "Ship it" }, { id: "gone", deletedAt: "2026-10-01T00:00:00.000Z" }, { id: "hidden", projectId: "arch" });
  const projects = projectsOf({ id: "p", name: "Home" }, { id: "arch", isArchived: true });

  test("matches comments on visible tasks, with the task and project names", () => {
    const found = matchComments([comment({ id: "1", content: "Need a Review" }), comment({ id: "2", taskId: "gone", content: "review" }), comment({ id: "3", taskId: "hidden", content: "review" }), comment({ id: "4", taskId: null, projectId: "p", content: "review" })], tasks, projects, "review", all);
    expect(found).toEqual([{ id: "1", content: "Need a Review", createdAt: "2026-10-01T00:00:00.000Z", taskContent: "Ship it", projectId: "p", projectName: "Home" }]);
  });

  test("merges the server's matches without repeats, newest first", () => {
    const at = (id: string, createdAt: string): CommentMatch => ({ id, content: id, createdAt, taskContent: "", projectId: "p", projectName: "" });
    const merged = mergeComments([at("a", "2026-10-02T00:00:00.000Z")], [at("a", "2026-10-02T00:00:00.000Z"), at("b", "2026-10-03T00:00:00.000Z")]);
    expect(merged.map((row) => row.id)).toEqual(["b", "a"]);
  });
});
