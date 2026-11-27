import { describe, expect, test } from "vitest";

import { projectEntity, taskEntity } from "@/lib/offline/fixtures";
import type { ProjectEntity, TaskEntity } from "@/lib/offline/types";
import { calendarTasks, compareDue, completedList, COMPLETED_LIMIT, isVisibleProject, labelTasks, openCounts, projectTasks, todayGroups, trashItems, upcomingDays, visibleProjects } from "./task-views";

const mapOf = (...rows: Partial<TaskEntity>[]) => new Map(rows.map((fields) => [fields.id!, taskEntity(fields)]));
const ids = (tasks: TaskEntity[]) => tasks.map((task) => task.id);

describe("projectTasks", () => {
  test("keeps the project's open tasks by order, and leaves out Trash and other projects", () => {
    const tasks = mapOf({ id: "b", order: "b" }, { id: "a", order: "a" }, { id: "x", projectId: "q" }, { id: "gone", deletedAt: "2026-10-01T00:00:00.000Z" });
    expect(ids(projectTasks(tasks, "p"))).toEqual(["a", "b"]);
  });

  test("shows a completed task only under an open parent", () => {
    const tasks = mapOf(
      { id: "root", order: "a" },
      { id: "done-root", order: "b", isCompleted: true },
      { id: "kid", order: "c", parentId: "root", isCompleted: true },
      { id: "closed", order: "d", isCompleted: true },
      { id: "closed-kid", order: "e", parentId: "closed", isCompleted: true },
      { id: "orphan", order: "f", parentId: "missing", isCompleted: true },
    );
    expect(ids(projectTasks(tasks, "p"))).toEqual(["root", "kid"]);
  });

  test("always shows the task the URL names", () => {
    const tasks = mapOf({ id: "done-root", isCompleted: true }, { id: "other", order: "b", isCompleted: true });
    expect(ids(projectTasks(tasks, "p", "done-root"))).toEqual(["done-root"]);
    expect(ids(projectTasks(tasks, "p", null))).toEqual([]);
  });

  test("shows an open task whose parent is gone or completed", () => {
    const tasks = mapOf({ id: "kid", parentId: "missing" }, { id: "done", order: "b", isCompleted: true }, { id: "kid2", order: "c", parentId: "done" });
    expect(ids(projectTasks(tasks, "p"))).toEqual(["kid", "kid2"]);
  });
});

describe("visibleProjects", () => {
  test("drops archived and trashed projects and puts shared ones last", () => {
    const list = [
      projectEntity({ id: "s", shared: true, order: "a0" }),
      projectEntity({ id: "b", order: "b0" }),
      projectEntity({ id: "a", order: "a0" }),
      projectEntity({ id: "arch", isArchived: true }),
      projectEntity({ id: "bin", deletedAt: "2026-10-01T00:00:00.000Z" }),
    ];
    expect(visibleProjects(list).map((project) => project.id)).toEqual(["a", "b", "s"]);
    expect(isVisibleProject(list[3])).toBe(false);
  });
});

describe("openCounts", () => {
  const projects = new Map([projectEntity({ id: "p" }), projectEntity({ id: "q" }), projectEntity({ id: "old", isArchived: true }), projectEntity({ id: "bin", deletedAt: "2026-10-01T00:00:00.000Z" })].map((project) => [project.id, project]));

  test("counts open tasks per visible project and those due today or earlier", () => {
    const tasks = mapOf(
      { id: "a", dueDate: "2026-11-26" },
      { id: "b", dueDate: "2026-11-27" },
      { id: "c", dueDate: "2026-11-28" },
      { id: "d", dueDate: null },
      { id: "e", projectId: "q", dueDate: "2026-01-01" },
    );
    expect(openCounts(tasks.values(), projects, "2026-11-27")).toEqual({ byProject: { p: 4, q: 1 }, today: 3 });
  });

  test("leaves out completed and trashed tasks, and projects that are archived, trashed or unknown", () => {
    const due = "2026-11-01";
    const tasks = mapOf(
      { id: "done", isCompleted: true, dueDate: due },
      { id: "bin", deletedAt: "2026-10-01T00:00:00.000Z", dueDate: due },
      { id: "archived", projectId: "old", dueDate: due },
      { id: "trashed", projectId: "bin", dueDate: due },
      { id: "unknown", projectId: "nope", dueDate: due },
    );
    expect(openCounts(tasks.values(), projects, "2026-11-27")).toEqual({ byProject: {}, today: 0 });
  });

  test("a project with a sub-task counts it like any other task", () => {
    const tasks = mapOf({ id: "a", dueDate: null }, { id: "kid", parentId: "a", dueDate: "2026-11-27" });
    expect(openCounts(tasks.values(), projects, "2026-11-27")).toEqual({ byProject: { p: 2 }, today: 1 });
  });
});

const projectsOf = (...rows: Partial<ProjectEntity>[]) => new Map(rows.map((fields) => [fields.id!, projectEntity(fields)]));
const liveProjects = projectsOf({ id: "p" }, { id: "q" }, { id: "arch", isArchived: true }, { id: "bin", deletedAt: "2026-10-01T00:00:00.000Z" });
const TODAY = "2026-11-27";

describe("compareDue", () => {
  test("orders by date, then time with no time last, then priority, then manual order", () => {
    const tasks = mapOf(
      { id: "undated", dueDate: null, order: "a" },
      { id: "late-time", dueDate: "2026-11-27", dueTime: "15:00", order: "b" },
      { id: "no-time-high", dueDate: "2026-11-27", dueTime: null, priority: 1, order: "c" },
      { id: "no-time-low", dueDate: "2026-11-27", dueTime: null, priority: 4, order: "d" },
      { id: "early-time", dueDate: "2026-11-27", dueTime: "08:15", order: "e" },
      { id: "earlier", dueDate: "2026-11-26", dueTime: null, order: "f" },
    );
    expect(ids([...tasks.values()].sort(compareDue))).toEqual(["earlier", "early-time", "late-time", "no-time-high", "no-time-low", "undated"]);
  });
});

describe("todayGroups", () => {
  test("splits open tasks due today or earlier into overdue then today", () => {
    const tasks = mapOf(
      { id: "today", dueDate: TODAY, order: "b" },
      { id: "old", dueDate: "2026-11-20", order: "c" },
      { id: "future", dueDate: "2026-11-28" },
      { id: "undated", dueDate: null },
    );
    const groups = todayGroups(tasks.values(), liveProjects, TODAY);
    expect(ids(groups.overdue)).toEqual(["old"]);
    expect(ids(groups.today)).toEqual(["today"]);
  });

  test("leaves out completed and trashed tasks, and tasks of archived, trashed or unknown projects", () => {
    const due = "2026-11-01";
    const tasks = mapOf(
      { id: "done", isCompleted: true, dueDate: due },
      { id: "bin", deletedAt: "2026-10-01T00:00:00.000Z", dueDate: due },
      { id: "archived", projectId: "arch", dueDate: due },
      { id: "trashed", projectId: "bin", dueDate: due },
      { id: "unknown", projectId: "nope", dueDate: due },
    );
    expect(todayGroups(tasks.values(), liveProjects, TODAY)).toEqual({ overdue: [], today: [] });
  });

  test("shows an open sub-task whose parent is completed, and one of another project", () => {
    const tasks = mapOf({ id: "parent", isCompleted: true, dueDate: TODAY }, { id: "kid", parentId: "parent", dueDate: "2026-11-01" }, { id: "elsewhere", projectId: "q", dueDate: TODAY });
    expect(ids(todayGroups(tasks.values(), liveProjects, TODAY).overdue)).toEqual(["kid"]);
    expect(ids(todayGroups(tasks.values(), liveProjects, TODAY).today)).toEqual(["elsewhere"]);
  });
});

describe("upcomingDays", () => {
  test("groups open tasks due today or later by day, in due order, and skips earlier ones", () => {
    const tasks = mapOf(
      { id: "tomorrow-2", dueDate: "2026-11-28", priority: 2, order: "b" },
      { id: "tomorrow-1", dueDate: "2026-11-28", priority: 1, order: "c" },
      { id: "today", dueDate: TODAY },
      { id: "past", dueDate: "2026-11-01" },
      { id: "undated", dueDate: null },
      { id: "later", dueDate: "2027-01-01" },
    );
    const days = upcomingDays(tasks.values(), liveProjects, TODAY);
    expect(days.map((day) => day.day)).toEqual([TODAY, "2026-11-28", "2027-01-01"]);
    expect(days.map((day) => ids(day.tasks))).toEqual([["today"], ["tomorrow-1", "tomorrow-2"], ["later"]]);
  });

  test("leaves out completed tasks and those of hidden projects", () => {
    const tasks = mapOf({ id: "done", isCompleted: true, dueDate: "2026-11-28" }, { id: "hidden", projectId: "arch", dueDate: "2026-11-28" });
    expect(upcomingDays(tasks.values(), liveProjects, TODAY)).toEqual([]);
  });
});

describe("labelTasks", () => {
  test("keeps open tasks with the label, in due order, from visible projects", () => {
    const tasks = mapOf(
      { id: "late", labelIds: ["x"], dueDate: "2026-12-01", order: "a" },
      { id: "soon", labelIds: ["x", "y"], dueDate: "2026-11-28", order: "b" },
      { id: "other", labelIds: ["y"], dueDate: "2026-11-01" },
      { id: "done", labelIds: ["x"], isCompleted: true },
      { id: "bin", labelIds: ["x"], deletedAt: "2026-10-01T00:00:00.000Z" },
      { id: "hidden", labelIds: ["x"], projectId: "arch" },
    );
    expect(ids(labelTasks(tasks.values(), liveProjects, "x"))).toEqual(["soon", "late"]);
  });
});

describe("calendarTasks", () => {
  const start = "2026-11-01";
  const end = "2026-12-12";

  test("keeps tasks due in the span, and repeating tasks that began before it and are still due by its end", () => {
    const tasks = mapOf(
      { id: "inside", dueDate: "2026-11-10" },
      { id: "before", dueDate: "2026-10-01" },
      { id: "repeat-before", dueDate: "2026-10-01", recurrence: "every day" },
      { id: "after", dueDate: "2026-12-20" },
      { id: "repeat-after", dueDate: "2026-12-20", recurrence: "every day" },
      { id: "undated", dueDate: null },
    );
    expect(ids(calendarTasks(tasks.values(), liveProjects, start, end))).toEqual(["repeat-before", "inside"]);
  });

  test("orders by date, then time with no time last, then manual order, not priority", () => {
    const tasks = mapOf(
      { id: "no-time-top", dueDate: "2026-11-10", dueTime: null, priority: 1, order: "a" },
      { id: "timed", dueDate: "2026-11-10", dueTime: "09:00", priority: 4, order: "z" },
      { id: "no-time-second", dueDate: "2026-11-10", dueTime: null, priority: 4, order: "b" },
    );
    expect(ids(calendarTasks(tasks.values(), liveProjects, start, end))).toEqual(["timed", "no-time-top", "no-time-second"]);
  });

  test("leaves out completed, trashed and hidden-project tasks", () => {
    const tasks = mapOf(
      { id: "done", dueDate: "2026-11-10", isCompleted: true },
      { id: "bin", dueDate: "2026-11-10", deletedAt: "2026-10-01T00:00:00.000Z" },
      { id: "hidden", dueDate: "2026-11-10", projectId: "arch" },
    );
    expect(calendarTasks(tasks.values(), liveProjects, start, end)).toEqual([]);
  });
});

describe("completedList", () => {
  const projects = new Map([["p", projectEntity()]]);

  test("keeps completed tasks of visible projects, newest first, and leaves out Trash", () => {
    const tasks = mapOf(
      { id: "old", isCompleted: true, completedAt: "2026-10-01T09:00:00.000Z" },
      { id: "new", isCompleted: true, completedAt: "2026-10-03T09:00:00.000Z" },
      { id: "open" },
      { id: "gone", isCompleted: true, completedAt: "2026-10-04T09:00:00.000Z", deletedAt: "2026-10-05T00:00:00.000Z" },
    );
    expect(ids(completedList(tasks, projects))).toEqual(["new", "old"]);
  });

  test("leaves out tasks under a completed parent, but keeps those under an open one", () => {
    const tasks = mapOf(
      { id: "root", isCompleted: true, completedAt: "2026-10-01T09:00:00.000Z" },
      { id: "under-open", parentId: "open", isCompleted: true, completedAt: "2026-10-02T09:00:00.000Z" },
      { id: "under-done", parentId: "root", isCompleted: true, completedAt: "2026-10-03T09:00:00.000Z" },
      { id: "open", order: "b" },
    );
    expect(ids(completedList(tasks, projects))).toEqual(["under-open", "root"]);
  });

  test("leaves out tasks of archived and trashed projects", () => {
    const hidden = new Map([
      ["p", projectEntity({ isArchived: true })],
      ["q", projectEntity({ id: "q", deletedAt: "2026-10-01T00:00:00.000Z" })],
    ]);
    const tasks = mapOf({ id: "a", isCompleted: true, completedAt: "2026-10-01T09:00:00.000Z" }, { id: "b", projectId: "q", isCompleted: true, completedAt: "2026-10-01T09:00:00.000Z" });
    expect(completedList(tasks, hidden)).toEqual([]);
  });

  test("shows the most recent COMPLETED_LIMIT", () => {
    const rows = Array.from({ length: COMPLETED_LIMIT + 5 }, (_, index) => ({ id: `t${index}`, isCompleted: true, completedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() }));
    const shown = completedList(mapOf(...rows), projects);
    expect(shown).toHaveLength(COMPLETED_LIMIT);
    expect(shown[0].id).toBe(`t${COMPLETED_LIMIT + 4}`);
  });
});

describe("trashItems", () => {
  const projects = new Map([["p", projectEntity()]]);
  const at = (day: number) => `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`;

  test("keeps trashed tasks of live projects, newest first, and leaves out their sub-tasks", () => {
    const tasks = mapOf(
      { id: "older", deletedAt: at(1) },
      { id: "newer", deletedAt: at(3) },
      { id: "root", deletedAt: at(2) },
      { id: "kid", parentId: "root", deletedAt: at(2) },
      { id: "live" },
    );
    expect(ids(trashItems(tasks, projects).tasks)).toEqual(["newer", "root", "older"]);
  });

  test("leaves out trashed tasks of a trashed project", () => {
    const both = new Map([...projects, ["q", projectEntity({ id: "q", deletedAt: at(1) })]]);
    const tasks = mapOf({ id: "gone", projectId: "q", deletedAt: at(2) }, { id: "kept", deletedAt: at(2) });
    expect(ids(trashItems(tasks, both).tasks)).toEqual(["kept"]);
  });

  test("keeps the tasks of archived projects", () => {
    const archived = new Map([["p", projectEntity({ isArchived: true })]]);
    expect(ids(trashItems(mapOf({ id: "t", deletedAt: at(1) }), archived).tasks)).toEqual(["t"]);
  });

  test("lists trashed projects the user owns, newest first, top level only", () => {
    const pool = new Map([
      ["a", projectEntity({ id: "a", deletedAt: at(1) })],
      ["b", projectEntity({ id: "b", deletedAt: at(4) })],
      ["child", projectEntity({ id: "child", parentId: "b", deletedAt: at(4) })],
      ["shared", projectEntity({ id: "shared", shared: true, deletedAt: at(5) })],
      ["live", projectEntity({ id: "live" })],
    ]);
    expect(trashItems(new Map(), pool).projects.map((project) => project.id)).toEqual(["b", "a"]);
  });
});
