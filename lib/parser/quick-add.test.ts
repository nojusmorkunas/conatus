import { describe, expect, test } from "vitest";
import { parseQuickAdd, type QuickAddParse } from "./quick-add";

// 2026-07-14 is a Tuesday.
const today = "2026-07-14";

const defaults: QuickAddParse = {
  content: "",
  projectName: null,
  labelNames: [],
  priority: 4,
  dueDate: null,
  dueTime: null,
  recurrence: null,
  deadlineDate: null,
  durationMinutes: null,
};

const cases: [string, Partial<QuickAddParse>][] = [
  // plain content
  ["Buy milk", { content: "Buy milk" }],
  // project
  ["Buy milk #groceries", { content: "Buy milk", projectName: "groceries" }],
  ["task #a #b", { content: "task", projectName: "b" }], // last one wins
  // labels
  ["Buy milk @errand", { content: "Buy milk", labelNames: ["errand"] }],
  ["x @a @b @a", { content: "x", labelNames: ["a", "b"] }], // deduped
  // priority
  ["Fix bug p1", { content: "Fix bug", priority: 1 }],
  ["Fix bug P3", { content: "Fix bug", priority: 3 }],
  ["p5 is not a priority", { content: "p5 is not a priority" }],
  // relative dates
  ["pay rent today", { content: "pay rent", dueDate: "2026-07-14" }],
  ["pay rent tod", { content: "pay rent", dueDate: "2026-07-14" }],
  ["pay rent Tomorrow", { content: "pay rent", dueDate: "2026-07-15" }],
  ["pay rent tmr", { content: "pay rent", dueDate: "2026-07-15" }],
  ["x in 3 days", { content: "x", dueDate: "2026-07-17" }],
  ["x in 1 day", { content: "x", dueDate: "2026-07-15" }],
  // weekdays: next occurrence strictly after today (today is Tuesday)
  ["x wednesday", { content: "x", dueDate: "2026-07-15" }],
  ["x wed", { content: "x", dueDate: "2026-07-15" }],
  ["x tuesday", { content: "x", dueDate: "2026-07-21" }], // rolls a full week
  ["x monday", { content: "x", dueDate: "2026-07-20" }],
  // next <weekday> / next week: the following week
  ["x next monday", { content: "x", dueDate: "2026-07-20" }],
  ["x next fri", { content: "x", dueDate: "2026-07-24" }],
  ["x next sunday", { content: "x", dueDate: "2026-07-26" }],
  ["x next week", { content: "x", dueDate: "2026-07-20" }],
  // explicit dates
  ["x 2026-12-31", { content: "x", dueDate: "2026-12-31" }],
  ["x 2026-02-31", { content: "x 2026-02-31" }], // invalid, stays in content
  // D/M and D.M: this year or next
  ["x 20/7", { content: "x", dueDate: "2026-07-20" }],
  ["x 14/7", { content: "x", dueDate: "2026-07-14" }], // today counts
  ["x 1/7", { content: "x", dueDate: "2027-07-01" }], // passed, next year
  ["x 5.3", { content: "x", dueDate: "2027-03-05" }],
  ["x 29/2", { content: "x 29/2" }], // invalid both years
  ["x 32/1", { content: "x 32/1" }],
  // recurrence: interval rules start today, weekday rules on the next one
  ["water plants every day", { content: "water plants", dueDate: "2026-07-14", recurrence: "every day" }],
  ["review every 2 weeks", { content: "review", dueDate: "2026-07-14", recurrence: "every 2 weeks" }],
  ["standup every Monday", { content: "standup", dueDate: "2026-07-20", recurrence: "every monday" }],
  ["retro every tue", { content: "retro", dueDate: "2026-07-21", recurrence: "every tuesday" }],
  ["rent every month at 9am", { content: "rent", dueDate: "2026-07-14", dueTime: "09:00", recurrence: "every month" }],
  ["gym every weekday", { content: "gym", dueDate: "2026-07-15", recurrence: "every weekday" }],
  ["review every! 3 days", { content: "review", dueDate: "2026-07-14", recurrence: "every! 3 days" }],
  ["sync every other monday", { content: "sync", dueDate: "2026-07-20", recurrence: "every other monday" }],
  // unrecognized "every ..." stays in content
  ["do it every so often", { content: "do it every so often" }],
  // recurrence counts as the first date phrase
  ["x every day tomorrow", { content: "x tomorrow", dueDate: "2026-07-14", recurrence: "every day" }],
  ["x tomorrow every day", { content: "x every day", dueDate: "2026-07-15" }],
  // only first date phrase is consumed
  ["ship today tomorrow", { content: "ship tomorrow", dueDate: "2026-07-14" }],
  // times
  ["call mom tomorrow at 17:30", { content: "call mom", dueDate: "2026-07-15", dueTime: "17:30" }],
  ["call mom at 9 tomorrow", { content: "call mom", dueDate: "2026-07-15", dueTime: "09:00" }],
  ["call mom at 5pm", { content: "call mom", dueDate: "2026-07-14", dueTime: "17:00" }], // time only defaults to today
  ["call mom at 12am", { content: "call mom", dueDate: "2026-07-14", dueTime: "00:00" }],
  ["call mom at 12pm", { content: "call mom", dueDate: "2026-07-14", dueTime: "12:00" }],
  ["call mom at 9:15am", { content: "call mom", dueDate: "2026-07-14", dueTime: "09:15" }],
  ["meet at noon", { content: "meet at noon" }], // not a recognized time
  ["meet at 99", { content: "meet at 99" }],
  ["meet at 13pm", { content: "meet at 13pm" }],
  // combination
  ["Buy milk #groceries @errand @home P2 tomorrow at 9am", {
    content: "Buy milk",
    projectName: "groceries",
    labelNames: ["errand", "home"],
    priority: 2,
    dueDate: "2026-07-15",
    dueTime: "09:00",
  }],
  // deadline: {date phrase} is independent of dueDate
  ["ship report {friday}", { content: "ship report", deadlineDate: "2026-07-17" }],
  ["ship report {next week}", { content: "ship report", deadlineDate: "2026-07-20" }],
  ["ship report {2026-08-01}", { content: "ship report", deadlineDate: "2026-08-01" }],
  ["ship report {nonsense}", { content: "ship report {nonsense}" }], // invalid, stays in content
  ["ship report {}", { content: "ship report {}" }], // empty braces stay in content
  ["ship report {friday} tomorrow p2", {
    content: "ship report",
    deadlineDate: "2026-07-17",
    dueDate: "2026-07-15",
    priority: 2,
  }],
  ["ship report {friday} {monday}", { content: "ship report {monday}", deadlineDate: "2026-07-17" }], // only first deadline consumed
  // duration: "for <duration>" token, each unit form
  ["deep work for 2h", { content: "deep work", durationMinutes: 120 }],
  ["deep work for 90m", { content: "deep work", durationMinutes: 90 }],
  ["deep work for 1h30m", { content: "deep work", durationMinutes: 90 }],
  ["deep work for 45min", { content: "deep work", durationMinutes: 45 }],
  // standalone "2h" without "for" is not a duration (collides with time parsing)
  ["deep work 2h", { content: "deep work 2h" }],
  // "for" with something unparseable stays in content
  ["wait for the bus", { content: "wait for the bus" }],
  // interaction with "at" times
  ["deep work tomorrow at 9 for 2h", {
    content: "deep work",
    dueDate: "2026-07-15",
    dueTime: "09:00",
    durationMinutes: 120,
  }],
  // empty-content guard: tokens are only consumed if content remains
  ["#work p1 tomorrow", { content: "#work p1 tomorrow" }],
  ["@waiting", { content: "@waiting" }],
  // bare markers are not tokens
  ["# @ alone", { content: "# @ alone" }],
  // garbage never throws
  ["", { content: "" }],
  ["   ", { content: "" }],
  ["!!! ??? %%", { content: "!!! ??? %%" }],
];

describe("parseQuickAdd", () => {
  test.each(cases)("%j", (input, expected) => {
    expect(parseQuickAdd(input, { today })).toEqual({ ...defaults, ...expected });
  });

  test("weekday rollover from a different today", () => {
    // 2026-07-17 is a Friday
    expect(parseQuickAdd("x saturday", { today: "2026-07-17" }).dueDate).toBe("2026-07-18");
    expect(parseQuickAdd("x friday", { today: "2026-07-17" }).dueDate).toBe("2026-07-24");
    expect(parseQuickAdd("x next week", { today: "2026-07-17" }).dueDate).toBe("2026-07-20");
    expect(parseQuickAdd("x next friday", { today: "2026-07-17" }).dueDate).toBe("2026-07-24");
  });

  test("month rollover for in N days", () => {
    expect(parseQuickAdd("x in 30 days", { today }).dueDate).toBe("2026-08-13");
  });
});
