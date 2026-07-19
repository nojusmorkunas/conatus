import { addDays } from "./dates";

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
