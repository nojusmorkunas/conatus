import { describe, expect, test } from "vitest";
import { addDays } from "./dates";
import { ACTIVITY_GRAPH_WEEKS, activityGraphStart, computeActivityGraph, computeStats } from "./stats";

const today = "2026-07-15";

describe("computeStats", () => {
  // One completion is enough to keep a day, so the counts per day never matter.
  const cases: [string, string[], Partial<ReturnType<typeof computeStats>>][] = [
    ["empty input", [], { currentStreak: 0, longestStreak: 0 }],
    ["today only", [today, today], { currentStreak: 1, longestStreak: 1 }],
    ["a single task keeps the day", [today], { currentStreak: 1, longestStreak: 1 }],
    ["streak ending yesterday", ["2026-07-13", "2026-07-14"], { currentStreak: 2, longestStreak: 2 }],
    ["streak broken by a missed day", ["2026-07-12", "2026-07-14"], { currentStreak: 1, longestStreak: 1 }],
    ["longest differs from current", ["2026-07-09", "2026-07-10", "2026-07-11", "2026-07-14"], { currentStreak: 1, longestStreak: 3 }],
    ["unordered input", ["2026-07-14", today, "2026-07-13", today], { currentStreak: 3, longestStreak: 3 }],
    ["a gap before today ends the streak", ["2026-07-12", "2026-07-13"], { currentStreak: 0, longestStreak: 2 }],
  ];

  test.each(cases)("%s", (_name, completionDates, expected) => {
    expect(computeStats(completionDates, { today })).toMatchObject(expected);
  });
});

describe("computeActivityGraph", () => {
  const graph = (dates: string[], weekStart = 1) =>
    computeActivityGraph(dates, { today, weekStart });

  test("starts on a week boundary a whole number of weeks back", () => {
    for (const weekStart of [0, 1]) {
      const start = activityGraphStart(today, weekStart);
      expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(weekStart);
      expect(graph([], weekStart).weeks[0][0]).toEqual({ date: start, count: 0 });
    }
  });

  test("fills a full year of seven-cell columns", () => {
    const weeks = graph([]).weeks;
    expect(weeks).toHaveLength(ACTIVITY_GRAPH_WEEKS);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  test("ends on today and pads the rest of the final week", () => {
    // today is a Wednesday, so a Monday-start week leaves Thursday onward null.
    const last = graph([]).weeks.at(-1)!;
    expect(last.map((day) => day?.date ?? null)).toEqual([
      "2026-07-13",
      "2026-07-14",
      today,
      null,
      null,
      null,
      null,
    ]);
  });

  test("counts repeated dates and reports the busiest day", () => {
    const result = graph([today, today, "2026-07-14", "2026-07-13", "2026-07-13", "2026-07-13"]);
    expect(result.total).toBe(6);
    expect(result.busiestDay).toEqual({ date: "2026-07-13", count: 3 });
    expect(result.weeks.at(-1)![2]).toEqual({ date: today, count: 2 });
  });

  test("ignores dates outside the window", () => {
    const before = activityGraphStart(today, 1);
    const result = graph([addDays(before, -1), "2027-01-01", today]);
    expect(result.total).toBe(1);
  });

  test("has no busiest day when nothing happened", () => {
    expect(graph([]).busiestDay).toBeNull();
  });

  test("labels each month once, in order, starting at the first column", () => {
    const months = graph([]).months;
    expect(months[0].weekIndex).toBe(0);
    expect(months).toHaveLength(13);
    expect(months.map((month) => month.weekIndex)).toEqual(
      [...months.map((month) => month.weekIndex)].sort((a, b) => a - b),
    );
  });
});
