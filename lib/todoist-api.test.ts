import { describe, expect, test, vi } from "vitest";

import { fetchTodoistProjects, parseTodoistSync } from "./todoist-api";

describe("Todoist API import", () => {
  test("keeps current recurring dates and maps hierarchy, notes, labels and priority", () => {
    const [project] = parseTodoistSync({
      projects: [{ id: "p1", name: "Work [6g8WPqw25HQhcQgV]", child_order: 1 }],
      sections: [{ id: "s1", project_id: "p1", name: "Next", section_order: 1 }],
      items: [{
        id: "t1", project_id: "p1", section_id: "s1", content: "Report",
        priority: 4, labels: ["deep-work"], due: {
          date: "2026-07-20T09:30:00", string: "every monday", is_recurring: true,
        },
      }],
      notes: [{ item_id: "t1", content: "Use the final figures" }],
    });
    expect(project.name).toBe("Work");
    expect(project.tasks[0]).toMatchObject({
      dueDate: "2026-07-20", dueTime: "09:30", recurrence: "every monday",
      priority: 1, labels: ["deep-work"], sectionKey: "s1",
    });
    expect(project.comments).toEqual([{ taskKey: "t1", content: "Use the final figures" }]);
    expect(project.warnings).toEqual([]);
  });

  test("does not leak the token and reports rejected credentials", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
    await expect(fetchTodoistProjects("a".repeat(40), fetcher as typeof fetch))
      .rejects.toThrow("Todoist rejected this API token");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.todoist.com/api/v1/sync",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${"a".repeat(40)}` }) }),
    );
  });
});
