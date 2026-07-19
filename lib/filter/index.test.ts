import { describe, expect, test } from "vitest";
import { evaluateFilter, parseFilter, type FilterableTask } from "./index";

// 2026-07-14 is a Tuesday.
const today = "2026-07-14";

const base: FilterableTask = {
  dueDate: null,
  dueTime: null,
  priority: 4,
  isCompleted: false,
  projectName: "Inbox",
  labelNames: [],
};

function run(query: string, task: Partial<FilterableTask>): boolean {
  const parsed = parseFilter(query);
  if ("error" in parsed) throw new Error(parsed.error);
  return evaluateFilter(parsed.ast, { ...base, ...task }, { today });
}

const matches: [string, Partial<FilterableTask>, boolean][] = [
  // date terms
  ["today", { dueDate: "2026-07-14" }, true],
  ["today", { dueDate: "2026-07-15" }, false],
  ["today", { dueDate: null }, false],
  ["TODAY", { dueDate: "2026-07-14" }, true],
  ["tomorrow", { dueDate: "2026-07-15" }, true],
  ["tomorrow", { dueDate: "2026-07-14" }, false],
  // overdue: date-only, strictly before today
  ["overdue", { dueDate: "2026-07-13" }, true],
  ["overdue", { dueDate: "2026-07-14", dueTime: "00:00" }, false],
  ["overdue", { dueDate: null }, false],
  // no date
  ["no date", { dueDate: null }, true],
  ["no date", { dueDate: "2026-07-14" }, false],
  ["No Date", { dueDate: null }, true],
  // due before: is exclusive
  ["due before: tomorrow", { dueDate: "2026-07-14" }, true],
  ["due before: tomorrow", { dueDate: "2026-07-15" }, false],
  ["due before: 2026-08-01", { dueDate: "2026-07-31" }, true],
  ["due before: 2026-08-01", { dueDate: "2026-08-01" }, false],
  ["due before: today", { dueDate: null }, false],
  // due after: is exclusive
  ["due after: today", { dueDate: "2026-07-15" }, true],
  ["due after: today", { dueDate: "2026-07-14" }, false],
  ["due after: next week", { dueDate: "2026-07-20" }, false], // next Monday itself
  ["due after: next week", { dueDate: "2026-07-21" }, true],
  ["due after: in 3 days", { dueDate: "2026-07-18" }, true],
  ["due before: friday", { dueDate: "2026-07-16" }, true],
  ["due before: 24.12", { dueDate: "2026-12-23" }, true],
  ["due before:tomorrow", { dueDate: "2026-07-14" }, true], // no space after colon
  // N days: today <= due <= today+N
  ["7 days", { dueDate: "2026-07-14" }, true],
  ["7 days", { dueDate: "2026-07-21" }, true],
  ["7 days", { dueDate: "2026-07-22" }, false],
  ["7 days", { dueDate: "2026-07-13" }, false], // overdue excluded
  ["7 days", { dueDate: null }, false],
  ["1 day", { dueDate: "2026-07-15" }, true],
  // priority
  ["p1", { priority: 1 }, true],
  ["p1", { priority: 2 }, false],
  ["P2", { priority: 2 }, true],
  ["no priority", { priority: 4 }, true],
  ["no priority", { priority: 3 }, false],
  // project / label, case-insensitive
  ["#Work", { projectName: "work" }, true],
  ["#work", { projectName: "Home" }, false],
  ["@errand", { labelNames: ["Errand", "urgent"] }, true],
  ["@errand", { labelNames: [] }, false],
  // no labels
  ["no labels", { labelNames: [] }, true],
  ["no labels", { labelNames: ["a"] }, false],
  // negation
  ["!today", { dueDate: null }, true],
  ["!today", { dueDate: "2026-07-14" }, false],
  ["!no labels", { labelNames: ["a"] }, true],
  // and / or
  ["today & p1", { dueDate: "2026-07-14", priority: 1 }, true],
  ["today & p1", { dueDate: "2026-07-14", priority: 2 }, false],
  ["today | p1", { dueDate: null, priority: 1 }, true],
  ["today | p1", { dueDate: null, priority: 2 }, false],
  // precedence: & binds tighter than |
  ["p1 | p2 & @x", { priority: 1, labelNames: [] }, true],
  ["p1 | p2 & @x", { priority: 2, labelNames: [] }, false],
  ["p1 | p2 & @x", { priority: 2, labelNames: ["x"] }, true],
  // parens override precedence
  ["(p1 | p2) & @x", { priority: 1, labelNames: [] }, false],
  ["(p1 | p2) & @x", { priority: 1, labelNames: ["x"] }, true],
  ["!(p1 | p2)", { priority: 3 }, true],
  ["!(p1 | p2)", { priority: 2 }, false],
  // comma is |
  ["p1, p2", { priority: 2 }, true],
  ["p1, p2", { priority: 3 }, false],
  // no whitespace around operators
  ["p1&@x", { priority: 1, labelNames: ["x"] }, true],
  ["(p1|p2)&!@x", { priority: 2, labelNames: [] }, true],
  // isCompleted is ignored by the evaluator
  ["p1", { priority: 1, isCompleted: true }, true],
];

describe("evaluateFilter", () => {
  test.each(matches)("%s on %o -> %s", (query, task, expected) => {
    expect(run(query, task)).toBe(expected);
  });
});

const errors: [string, RegExp][] = [
  ["", /empty query/],
  ["   ", /empty query/],
  ["today &", /unexpected end of query/],
  ["& today", /expected a filter term/],
  ["(today | p1", /unclosed parenthesis/],
  ["today)", /unexpected token .*\)/],
  ["garbage", /unknown token .*garbage/],
  ["today p1", /unexpected token/], // adjacent terms without an operator
  ["due before:", /expected a date/],
  ["due before: nonsense", /expected a date/],
  ["due before: 2026-13-01", /expected a date/],
  ["#", /missing name/],
  ["@", /missing name/],
  ["p5", /unknown token/],
  ["no", /unknown token/],
  ["5 weeks", /unknown token/],
];

describe("parseFilter errors", () => {
  test.each(errors)("%s -> %s", (query, message) => {
    const parsed = parseFilter(query);
    expect(parsed).toHaveProperty("error");
    if ("error" in parsed) expect(parsed.error).toMatch(message);
  });
});
