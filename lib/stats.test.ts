import { describe, expect, test } from "vitest";
import { computeStats } from "./stats";

const today = "2026-07-15";

describe("computeStats", () => {
  const cases: [string, string[], number, Partial<ReturnType<typeof computeStats>>][] = [
    ["empty input", [], 2, { todayCount: 0, currentStreak: 0, longestStreak: 0 }],
    ["today only", [today, today], 2, { todayCount: 2, currentStreak: 1, longestStreak: 1 }],
    ["streak ending yesterday", ["2026-07-13", "2026-07-13", "2026-07-14", "2026-07-14"], 2, { currentStreak: 2, longestStreak: 2 }],
    ["streak broken by a missed day", ["2026-07-12", "2026-07-12", "2026-07-14", "2026-07-14"], 2, { currentStreak: 1, longestStreak: 1 }],
    ["longest differs from current", ["2026-07-09", "2026-07-09", "2026-07-10", "2026-07-10", "2026-07-11", "2026-07-11", "2026-07-14", "2026-07-14"], 2, { currentStreak: 1, longestStreak: 3 }],
    ["goal boundary", [today, today, "2026-07-14"], 2, { todayCount: 2, currentStreak: 1, longestStreak: 1 }],
    ["unordered input", ["2026-07-14", today, "2026-07-13", today, "2026-07-13", "2026-07-14"], 2, { currentStreak: 3, longestStreak: 3 }],
  ];

  test.each(cases)("%s", (_name, completionDates, dailyGoal, expected) => {
    expect(computeStats(completionDates, { today, dailyGoal })).toMatchObject(expected);
  });

  test("returns seven days oldest first through today", () => {
    expect(computeStats([today], { today, dailyGoal: 1 }).last7).toEqual([
      { date: "2026-07-09", count: 0 },
      { date: "2026-07-10", count: 0 },
      { date: "2026-07-11", count: 0 },
      { date: "2026-07-12", count: 0 },
      { date: "2026-07-13", count: 0 },
      { date: "2026-07-14", count: 0 },
      { date: today, count: 1 },
    ]);
  });
});
