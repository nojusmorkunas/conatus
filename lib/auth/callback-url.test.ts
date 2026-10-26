import { expect, test } from "vitest";

import { safeCallbackPath } from "./callback-url";

test("keeps the device sign-in callback path and query", () => {
  const path = "/device-login?device=Pixel&challenge=x";
  expect(safeCallbackPath(path)).toBe(path);
});

test.each(["//evil.example", "https://evil.example", "/\\evil.example", "", null, undefined])(
  "rejects unsafe or missing callback %s",
  (value) => {
    expect(safeCallbackPath(value)).toBe("/");
  },
);
