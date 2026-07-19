import { describe, expect, test } from "vitest";

import { escapeLike } from "./search";

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
