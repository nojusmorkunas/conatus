import { describe, expect, test } from "vitest";

import {
  cleanTodoistProjectName,
  parseTodoistCsv,
  summarizeTodoistProject,
} from "./todoist-import";

const HEADER = "TYPE,CONTENT,DESCRIPTION,IS_COLLAPSED,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG";

function csv(...rows: string[]) {
  return [HEADER, ...rows].join("\r\n");
}

describe("parseTodoistCsv", () => {
  test("preserves sections, nesting, descriptions, notes, dates, and priorities", () => {
    const project = parseTodoistCsv(
      csv(
        "meta,view_style=list,,,,,,,,,,,,,",
        'section,Planning,"A section, with context",false,,,,,,,,,,,',
        'task,"Parent, task","Line one\nLine two",,2,1,me,,Jul 17,en,Europe/Amsterdam,,,2026-08-01,en',
        "task,Child task,,,4,2,me,,,,Europe/Amsterdam,,,,",
        'note,"A useful note",,,,2,me,,2026-07-17T10:00:00.000000Z,,,,,,',
        'project_note,"Project context",,,,,me,,2026-07-17T10:00:00.000000Z,,,,,,',
      ),
      { sourceId: "source", projectName: "Migration test", referenceDate: "2026-07-18" },
    );

    expect(project.name).toBe("Migration test");
    expect(project.sections).toEqual([{ key: "section-1", name: "Planning" }]);
    expect(project.tasks).toHaveLength(2);
    expect(project.tasks[0]).toMatchObject({
      content: "Parent, task",
      description: "Line one\nLine two",
      priority: 2,
      dueDate: "2026-07-17",
      deadlineDate: "2026-08-01",
      recurrenceEndDate: null,
      parentKey: null,
    });
    expect(project.tasks[1].parentKey).toBe(project.tasks[0].key);
    expect(project.comments).toEqual([
      { taskKey: null, content: "Section note — Planning\n\nA section, with context" },
      { taskKey: project.tasks[1].key, content: "A useful note" },
      { taskKey: null, content: "Project context" },
    ]);
  });

  test("normalizes supported Todoist recurrence clauses", () => {
    const project = parseTodoistCsv(
      csv(
        "task,Monthly,,,4,1,me,,every month,en,Europe/Amsterdam,,,,",
        "task,Completion relative,,,4,1,me,,every! 2 weeks,en,Europe/Amsterdam,,,,",
        "task,With start,,,4,1,me,,every 90 days starting Aug 11,en,Europe/Amsterdam,,,,",
        "task,With end,,,4,1,me,,every 9th ending 2027-08-10,en,Europe/Amsterdam,,,,",
      ),
      { sourceId: "source", projectName: "Recurring", referenceDate: "2026-07-18" },
    );

    expect(project.tasks.map((task) => [task.recurrence, task.dueDate])).toEqual([
      ["every month", null],
      ["every! 2 weeks", null],
      ["every 90 days", "2026-08-11"],
      ["every 9th", null],
    ]);
    expect(project.tasks[3].recurrenceEndDate).toBe("2027-08-10");
    expect(project.warnings).not.toContain(
      "A recurring end date is not supported; the recurrence will continue until stopped.",
    );
  });

  test("never invents the current occurrence omitted from a Todoist backup", () => {
    const project = parseTodoistCsv(
      csv(
        "task,Monthly,,,4,1,me,,every month,en,Europe/Amsterdam,,,,",
        "task,Quarterly,,,4,1,me,,every 3 months,en,Europe/Amsterdam,,,,",
        "task,Completion relative,,,4,1,me,,every! 2 weeks,en,Europe/Amsterdam,,,,",
        "task,Three weekly,,,4,1,me,,every 3 weeks,en,Europe/Amsterdam,,,,",
        "task,Fortnightly,,,4,1,me,,every 14 days,en,Europe/Amsterdam,,,,",
      ),
      { sourceId: "source", projectName: "Recurring", referenceDate: "2026-07-17" },
    );

    expect(project.tasks.map((task) => task.dueDate)).toEqual([null, null, null, null, null]);
    expect(project.warnings).toContain(
      "Todoist did not include the current occurrence for one or more recurring tasks; enter the date shown in Todoist before importing.",
    );

    const preview = summarizeTodoistProject(project, new Set());
    expect(preview.recurringDatesNeedingReview).toEqual([
      { taskId: "task-0", content: "Monthly", recurrence: "every month" },
      { taskId: "task-1", content: "Quarterly", recurrence: "every 3 months" },
      { taskId: "task-2", content: "Completion relative", recurrence: "every! 2 weeks" },
      { taskId: "task-3", content: "Three weekly", recurrence: "every 3 weeks" },
      { taskId: "task-4", content: "Fortnightly", recurrence: "every 14 days" },
    ]);
  });

  test("only trusts a recurring start that is still in the future at backup time", () => {
    const project = parseTodoistCsv(
      csv(
        "task,Future start,,,4,1,me,,every 2 weeks starting Aug 1,en,Europe/Amsterdam,,,,",
        "task,Past start,,,4,1,me,,every 2 weeks starting Jul 1,en,Europe/Amsterdam,,,,",
      ),
      { sourceId: "source", projectName: "Recurring", referenceDate: "2026-07-17" },
    );

    expect(project.tasks.map((task) => task.dueDate)).toEqual(["2026-08-01", null]);
    expect(summarizeTodoistProject(project, new Set()).recurringDatesNeedingReview).toEqual([
      { taskId: "task-1", content: "Past start", recurrence: "every 2 weeks" },
    ]);
  });

  test("rejects unrelated CSV files", () => {
    expect(() =>
      parseTodoistCsv("name,value\nhello,world", {
        sourceId: "source",
        projectName: "Bad",
        referenceDate: "2026-07-18",
      }),
    ).toThrow(/not a Todoist CSV/);
  });
});

describe("cleanTodoistProjectName", () => {
  test("removes Todoist's trailing bracketed project id", () => {
    expect(cleanTodoistProjectName("project_name [6g8WPqw25HQhcQgV]")).toBe("project_name");
  });

  test("does not remove ordinary bracketed name text", () => {
    expect(cleanTodoistProjectName("Planning [Q3] ")).toBe("Planning [Q3]");
  });
});
