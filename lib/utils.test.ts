import { describe, expect, it } from "vitest";

import { truncate } from "./utils";

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("Buy milk")).toBe("Buy milk");
  });

  it("never returns more characters than the limit", () => {
    const long = "a".repeat(200);
    expect(truncate(long)).toHaveLength(40);
    expect(truncate(long, 10)).toHaveLength(10);
  });

  it("marks what it cut", () => {
    expect(truncate("Rewrite the onboarding email sequence", 12)).toBe("Rewrite the…");
  });
});
