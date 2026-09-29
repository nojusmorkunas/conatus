import { describe, expect, test } from "vitest";

import { escapeLike, searchFilters } from "./search";

describe("escapeLike", () => {
  const slash = String.fromCharCode(92);

  test.each([
    ["plain text", "plain text"],
    ["100%", `100${slash}%`],
    ["under_score", `under${slash}_score`],
    [`path${slash}name`, `path${slash}${slash}name`],
    [`%_${slash}`, `${slash}%${slash}_${slash}${slash}`],
  ])("escapes %s", (value, expected) => {
    expect(escapeLike(value)).toBe(expected);
  });
});

describe("searchFilters", () => {
  const projectIds = ["a", "b"];

  test("keeps an accessible project and a known status", () => {
    expect(searchFilters({ project: "b", status: "completed" }, projectIds)).toEqual({
      project: "b",
      status: "completed",
    });
  });

  test("falls back to everything for unknown, inaccessible or repeated values", () => {
    expect(searchFilters({}, projectIds)).toEqual({ project: null, status: "all" });
    expect(searchFilters({ project: "c", status: "done" }, projectIds)).toEqual({ project: null, status: "all" });
    expect(searchFilters({ project: ["a", "b"], status: ["open"] }, projectIds)).toEqual({ project: null, status: "all" });
  });
});
