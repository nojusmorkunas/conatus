import { describe, expect, test } from "vitest";
import { parseQuickAdd, parseQuickAddPreview, removeQuickAddTokens, type QuickAddParse } from "./quick-add";

const today = "2026-07-14"; // Tuesday; calendar arithmetic is independent of TZ.
const empty: QuickAddParse = { content: "Task", projectName: null, labelNames: [], priority: 4, dueDate: null, dueTime: null, recurrence: null, deadlineDate: null, durationMinutes: null, reminderAt: null };

describe("natural-language audit regressions", () => {
  test.each([
    ["at noon", "12:00"], ["at midnight", "00:00"], ["noon", "12:00"],
    ["at 5 pm", "17:00"], ["at 3:00 PM", "15:00"], ["at 5 a.m.", "05:00"],
    ["at 5 p.m.", "17:00"], ["at 05:00pm", "17:00"], ["5pm", "17:00"],
    ["5 pm", "17:00"], ["at 12 am", "00:00"], ["at 12 p.m.", "12:00"],
    ["17:30", "17:30"], ["at 5pm.", "17:00"],
  ])("clock: %s", (phrase, dueTime) => {
    expect(parseQuickAdd("Task " + phrase, { today })).toEqual({ ...empty, dueDate: today, dueTime });
  });

  test.each([
    ["tomorrow morning", "2026-07-15", "09:00"], ["this morning", today, "09:00"],
    ["this afternoon", today, "15:00"], ["this evening", today, "18:00"],
    ["tonight", today, "18:00"], ["tomorrow evening", "2026-07-15", "18:00"],
    ["tomorrow morning at 10am", "2026-07-15", "10:00"],
  ])("part of day: %s", (phrase, dueDate, dueTime) => {
    expect(parseQuickAdd("Task " + phrase, { today })).toEqual({ ...empty, dueDate, dueTime });
  });

  test.each([
    ["in two days", "2026-07-16"], ["in 2 weeks", "2026-07-28"],
    ["next month", "2026-08-14"], ["next year", "2027-07-14"],
    ["in a week", "2026-07-21"], ["a week from now", "2026-07-21"],
    ["2 days from now", "2026-07-16"], ["in twenty-one days", "2026-08-04"],
    ["in twenty one days", "2026-08-04"], ["in two months", "2026-09-14"],
    ["September 15", "2026-09-15"], ["Sep 15", "2026-09-15"],
    ["15 Sep", "2026-09-15"], ["15th September", "2026-09-15"],
    ["September 15th", "2026-09-15"], ["Sep. 15, 2027", "2027-09-15"],
    ["on Friday", "2026-07-17"], ["this Friday", "2026-07-17"],
    ["coming Monday", "2026-07-20"], ["upcoming Monday", "2026-07-20"],
    ["on the 1st", "2026-08-01"], ["the 15th", "2026-07-15"],
    ["on the twenty-first", "2026-07-21"],
    ["due Friday", "2026-07-17"], ["due by Friday", "2026-07-17"],
    ["by Friday", "2026-07-17"], ["due on Friday", "2026-07-17"],
    ["3/9", "2026-09-03"], ["9/3", "2027-03-09"],
  ])("date: %s", (phrase, dueDate) => {
    expect(parseQuickAdd("Task " + phrase, { today })).toEqual({ ...empty, dueDate });
  });

  test.each([
    ["for 2 hours", 120], ["for 90 minutes", 90], ["for 2 hrs", 120], ["for 30 mins", 30],
    ["for an hour", 60], ["for half an hour", 30], ["for 1h 30m", 90],
    ["for 1.5 hours", 90], ["for two hours", 120], ["for one hour and thirty minutes", 90],
    ["for 1h30m", 90], ["for an hour and a half", 90], ["for a quarter of an hour", 15],
  ])("duration: %s", (phrase, durationMinutes) => {
    expect(parseQuickAdd("Task " + phrase, { today })).toEqual({ ...empty, durationMinutes });
  });

  test.each([
    ["daily", "every day", today], ["weekly", "every week", today],
    ["monthly", "every month", today], ["yearly", "every year", today],
    ["every fortnight", "every 2 weeks", today],
    ["every weekend", "every saturday, sunday", "2026-07-18"],
    ["every Monday and Wednesday", "every monday, wednesday", "2026-07-15"],
    ["every Mon, Wed, Fri", "every monday, wednesday, friday", "2026-07-15"],
    ["every Mon,Wed,Fri", "every monday, wednesday, friday", "2026-07-15"],
    ["the first Friday of every month", "every 1st friday", "2026-08-07"],
    ["every 2nd Friday", "every 2nd friday", "2026-08-14"],
    ["every last friday", "every last friday", "2026-07-31"],
    ["1st of every month", "every 1st", "2026-08-01"],
    ["every month on the first Friday", "every 1st friday", "2026-08-07"],
    ["every! second Friday", "every! 2nd friday", "2026-08-14"],
    ["every! Mon and Wed", "every! monday, wednesday", "2026-07-15"],
  ])("repeat: %s", (phrase, recurrence, dueDate) => {
    expect(parseQuickAdd("Task " + phrase, { today })).toEqual({ ...empty, recurrence, dueDate });
  });

  test.each([
    ["deadline Friday", "2026-07-17"], ["deadline by September 15", "2026-09-15"],
    ["{in 2 weeks}", "2026-07-28"], ["{next month}", "2026-08-14"],
    ["{September 15th}", "2026-09-15"], ["{in twenty one days}", "2026-08-04"],
    ["{ next month }", "2026-08-14"],
  ])("deadline: %s", (phrase, deadlineDate) => {
    expect(parseQuickAdd("Task " + phrase, { today })).toEqual({ ...empty, deadlineDate });
  });

  test.each([
    ["Remind me tomorrow to call mom", "call mom", "2026-07-15T09:00"],
    ["Remind me tomorrow at noon to call mom", "call mom", "2026-07-15T12:00"],
    ["Call mom remind me at 5 pm", "Call mom", "2026-07-14T17:00"],
    ["Remind me this afternoon to call mom", "call mom", "2026-07-14T15:00"],
    ["Remind me tomorrow morning at 10am to call mom", "call mom", "2026-07-15T10:00"],
    ["Remind me to call mom tomorrow at 5pm", "call mom", "2026-07-15T17:00"],
  ])("reminder: %s", (input, content, reminderAt) => {
    expect(parseQuickAdd(input, { today })).toEqual({ ...empty, content, reminderAt });
  });

  test.each([
    "around 3", "around 3pm", "at 3ish", "biweekly", "twice a week",
    "at 13 pm", "at 25:30", "at 5 p", "at 1.5", "for 25.5 hours", "for 0.001 hours", "for 1h 30", "for 1.5 ho",
    "every second", "every 32nd Friday", "every 2th Friday", "every 6th Friday", "every 2nd Friday of", "every Monday and Wedn", "every Mon, Wed, F", "every Mon, Wed, nonsense",
    "{noon}", "{some Friday}", "{next month", "February 30", "Sep 31",
    "remind me tomorrow at 13 pm", "remind me tomorrow at 5 p", "remind me tomorrow around 3",
    "in 99999999999999999999 weeks", "every 9999999999999999999 days",
  ])("ambiguous, invalid, or unfinished phrases stay intact: %s", (phrase) => {
    expect(parseQuickAdd("Task " + phrase, { today })).toEqual({ ...empty, content: "Task " + phrase });
  });

  test("punctuation cannot drop the date and default an otherwise valid time to today", () => {
    const input = "Task tomorrow, at 5 pm. p1! #Home office, @deep work!";
    const result = parseQuickAddPreview(input, { today, projectNames: ["Home office"], labelNames: ["deep work"] });
    expect(result.parsed).toEqual({ ...empty, dueDate: "2026-07-15", dueTime: "17:00", priority: 1, projectName: "Home office", labelNames: ["deep work"] });
    expect(result.tokens.map((token) => input.slice(token.start, token.end))).toEqual(["tomorrow,", "at 5 pm.", "p1!", "#Home office,", "@deep work!"]);
    expect(removeQuickAddTokens(input, result.tokens)).toBe("Task");
  });

  test("keeps meaningful punctuation in existing names and literal text", () => {
    expect(parseQuickAddPreview("Task! #Home! @later?", { today, projectNames: ["Home", "Home!"], labelNames: ["later?"] }).parsed)
      .toEqual({ ...empty, content: "Task!", projectName: "Home!", labelNames: ["later?"] });
  });

  test("month and year offsets clamp at calendar boundaries", () => {
    expect(parseQuickAdd("Task next month", { today: "2026-01-31" }).dueDate).toBe("2026-02-28");
    expect(parseQuickAdd("Task next year", { today: "2028-02-29" }).dueDate).toBe("2029-02-28");
    expect(parseQuickAdd("Task September 15", { today: "2026-10-01" }).dueDate).toBe("2027-09-15");
    expect(parseQuickAdd("Task the 31st", { today: "2026-04-30" }).dueDate).toBe("2026-05-31");
  });
});
