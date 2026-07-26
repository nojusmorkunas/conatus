import { addDays, weekStartOf } from "./dates";

export function computeStats(
  completionDates: string[],
  opts: { today: string; dailyGoal: number },
): {
  todayCount: number;
  last7: { date: string; count: number }[];
  currentStreak: number;
  longestStreak: number;
} {
  const counts = new Map<string, number>();
  for (const date of completionDates) {
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const last7 = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(opts.today, index - 6);
    return { date, count: counts.get(date) ?? 0 };
  });
  const todayCount = counts.get(opts.today) ?? 0;
  const countsTowardGoal = (date: string) => (counts.get(date) ?? 0) >= opts.dailyGoal;

  let currentStreak = 0;
  let currentDate = countsTowardGoal(opts.today)
    ? opts.today
    : addDays(opts.today, -1);
  while (countsTowardGoal(currentDate)) {
    currentStreak += 1;
    currentDate = addDays(currentDate, -1);
  }

  const countingDates = [...counts.entries()]
    .filter(([, count]) => count >= opts.dailyGoal)
    .map(([date]) => date)
    .sort();
  let longestStreak = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of countingDates) {
    run = previous === addDays(date, -1) ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = date;
  }

  return { todayCount, last7, currentStreak, longestStreak };
}

export const ACTIVITY_GRAPH_WEEKS = 53;

export type ActivityGraphDay = { date: string; count: number };

// A calendar column is always seven cells. Cells after today are null so the
// final column renders as a partial week instead of implying future zeroes.
export type ActivityGraphWeek = (ActivityGraphDay | null)[];

// The first day the graph can show, so callers know how far back to query.
export function activityGraphStart(today: string, weekStart: number): string {
  return addDays(weekStartOf(today, weekStart), -(ACTIVITY_GRAPH_WEEKS - 1) * 7);
}

export function computeActivityGraph(
  dates: string[],
  opts: { today: string; weekStart: number },
): {
  weeks: ActivityGraphWeek[];
  months: { label: string; weekIndex: number }[];
  total: number;
  busiestDay: ActivityGraphDay | null;
} {
  const counts = new Map<string, number>();
  for (const date of dates) {
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const start = activityGraphStart(opts.today, opts.weekStart);
  const weeks: ActivityGraphWeek[] = [];
  const months: { label: string; weekIndex: number }[] = [];
  let total = 0;
  let busiestDay: ActivityGraphDay | null = null;
  let previousMonth = "";

  for (let week = 0; week < ACTIVITY_GRAPH_WEEKS; week += 1) {
    const cells: ActivityGraphWeek = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = addDays(start, week * 7 + weekday);
      if (date > opts.today) {
        cells.push(null);
        continue;
      }
      const count = counts.get(date) ?? 0;
      total += count;
      if (!busiestDay || count > busiestDay.count) busiestDay = { date, count };
      cells.push({ date, count });
    }
    weeks.push(cells);

    // Label a column when its first day opens a month the previous column did
    // not already cover, which is how the month runs above the grid line up.
    const columnStart = addDays(start, week * 7);
    const month = columnStart.slice(0, 7);
    if (month !== previousMonth) {
      months.push({
        label: new Date(`${columnStart}T00:00:00Z`).toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        weekIndex: week,
      });
      previousMonth = month;
    }
  }

  return { weeks, months, total, busiestDay: busiestDay?.count ? busiestDay : null };
}
