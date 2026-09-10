import { describe, expect, it } from "vitest";
import { calendarOccurrences, calendarPeriod } from "./calendar";

const task = {
  id: "task-1", dueDate: "2026-01-31", recurrence: "every month",
  recurrenceEndDate: null, dueTime: "09:30",
};

describe("calendar occurrences", () => {
  it("includes repeats whose stored date is outside the visible month without drifting month-end anchors", () => {
    const result = calendarOccurrences([task], "2026-02-01", "2026-04-30");
    expect(result.map((entry) => entry.dueDate)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(result.every((entry) => entry.isProjection && entry.dueTime === "09:30")).toBe(true);
    expect(new Set(result.map((entry) => entry.occurrenceId)).size).toBe(3);
    expect(task.dueDate).toBe("2026-01-31");
  });

  it("shows the actual due date once and stops previews at the inclusive end date", () => {
    const result = calendarOccurrences([{ ...task, recurrence: "every day", recurrenceEndDate: "2026-02-02" }], "2026-01-31", "2026-02-10");
    expect(result.map((entry) => [entry.dueDate, entry.isProjection])).toEqual([
      ["2026-01-31", false], ["2026-02-01", true], ["2026-02-02", true],
    ]);
  });

  it("skips weekends and keeps fortnightly parity across distant periods", () => {
    expect(calendarOccurrences([{ ...task, dueDate: "2026-09-04", recurrence: "every weekday" }], "2026-09-05", "2026-09-08").map((entry) => entry.dueDate))
      .toEqual(["2026-09-07", "2026-09-08"]);
    expect(calendarOccurrences([{ ...task, dueDate: "2026-08-03", recurrence: "every other monday" }], "2026-09-01", "2026-09-30").map((entry) => entry.dueDate))
      .toEqual(["2026-09-14", "2026-09-28"]);
  });

  it("previews completion-relative schedules assuming on-time completion", () => {
    expect(calendarOccurrences([{ ...task, recurrence: "every! 3 days" }], "2026-02-01", "2026-02-08").map((entry) => entry.dueDate))
      .toEqual(["2026-02-03", "2026-02-06"]);
  });

  it("projects each day in a weekday list and preserves monthly weekday anchors", () => {
    expect(calendarOccurrences([{ ...task, dueDate: "2026-07-13", recurrence: "every monday, wednesday, friday" }], "2026-07-14", "2026-07-24").map((entry) => entry.dueDate))
      .toEqual(["2026-07-15", "2026-07-17", "2026-07-20", "2026-07-22", "2026-07-24"]);
    expect(calendarOccurrences([{ ...task, dueDate: "2026-06-12", recurrence: "every 2nd friday" }], "2026-07-01", "2026-09-30").map((entry) => entry.dueDate))
      .toEqual(["2026-07-10", "2026-08-14", "2026-09-11"]);
    expect(calendarOccurrences([{ ...task, dueDate: "2026-06-29", recurrence: "every 5th monday" }], "2026-07-01", "2026-11-30").map((entry) => entry.dueDate))
      .toEqual(["2026-08-31", "2026-11-30"]);
  });

  it("leaves non-recurring and unsupported rules as single stored occurrences", () => {
    for (const recurrence of [null, "unsupported rule"]) {
      expect(calendarOccurrences([{ ...task, recurrence }], "2026-01-01", "2026-02-28")).toHaveLength(1);
      expect(calendarOccurrences([{ ...task, recurrence }], "2026-02-01", "2026-02-28")).toHaveLength(0);
    }
    expect(calendarOccurrences([{ ...task, dueDate: null }], "2026-01-01", "2026-02-28")).toEqual([]);
  });
});

describe("calendar navigation", () => {
  it("anchors both view switches to the selected period", () => {
    expect(calendarPeriod({ month: "2027-05" }, "2026-09-07", 1)).toMatchObject({ month: "2027-05", week: "2027-04-26" });
    expect(calendarPeriod({ view: "week", week: "2027-05-18" }, "2026-09-07", 1)).toMatchObject({ month: "2027-05", week: "2027-05-17" });
  });
  it("rejects impossible dates instead of crashing the calendar", () => {
    expect(calendarPeriod({ month: "2026-99" }, "2026-09-07", 1).month).toBe("2026-09");
    expect(calendarPeriod({ view: "week", week: "2026-02-31" }, "2026-09-07", 1).week).toBe("2026-09-07");
  });
});
