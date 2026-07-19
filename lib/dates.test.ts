import { expect, test } from "vitest";

import { monthGridStart, weekStartOf } from "./dates";

test("monthGridStart backs up to Monday when weekStart is 1", () => {
  // 2026-07-01 is a Wednesday; Monday-start grid begins two days earlier.
  expect(monthGridStart("2026-07", 1)).toBe("2026-06-29");
});

test("monthGridStart backs up to Sunday when weekStart is 0", () => {
  expect(monthGridStart("2026-07", 0)).toBe("2026-06-28");
});

test("weekStartOf finds the Monday of the containing week", () => {
  expect(weekStartOf("2026-07-15", 1)).toBe("2026-07-13");
});
