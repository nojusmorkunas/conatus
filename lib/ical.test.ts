import { expect, test } from "vitest";

import { buildCalendar, escapeText, foldLine } from "./ical";

test("escapes backslash, comma, semicolon, and newline", () => {
  expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
});

test("folds a line longer than 75 octets", () => {
  const long = "SUMMARY:" + "x".repeat(100);
  const folded = foldLine(long);
  const lines = folded.split("\r\n");
  expect(lines.length).toBeGreaterThan(1);
  expect(lines[0].length).toBe(75);
  expect(lines[1].startsWith(" ")).toBe(true);
  expect(lines.join("").replace(/ /g, "")).toBe(long.replace(/ /g, ""));
});

test("does not fold short lines", () => {
  expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
});

test("all-day task uses DTSTART;VALUE=DATE", () => {
  const ics = buildCalendar(
    [{ id: "t1", content: "Task", description: null, dueDate: "2026-07-15", dueTime: null }],
    "Cal",
  );
  expect(ics).toContain("DTSTART;VALUE=DATE:20260715");
});

test("timed task uses floating local DTSTART with no Z or TZID", () => {
  const ics = buildCalendar(
    [{ id: "t1", content: "Task", description: null, dueDate: "2026-07-15", dueTime: "14:30" }],
    "Cal",
  );
  expect(ics).toContain("DTSTART:20260715T143000");
  expect(ics).not.toContain("Z\r\n");
  expect(ics).not.toContain("TZID");
});
