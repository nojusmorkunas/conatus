import { describe, expect, it } from "vitest";

import { autoLabelIds } from "./auto-label";

const rules = [
  { contains: "invoice", labelId: "finance" },
  { contains: "Call", labelId: "phone" },
  { contains: "   ", labelId: "never" },
];

describe("autoLabelIds", () => {
  it("matches regardless of case and position", () => {
    expect(autoLabelIds("Send the INVOICE to Ada", rules)).toEqual(["finance"]);
    expect(autoLabelIds("call the dentist", rules)).toEqual(["phone"]);
  });

  it("returns every matching rule once", () => {
    expect(autoLabelIds("Call about the invoice", [...rules, { contains: "invoice", labelId: "finance" }]))
      .toEqual(["finance", "phone"]);
  });

  it("ignores blank rules and non-matches", () => {
    expect(autoLabelIds("Water the plants", rules)).toEqual([]);
  });
});
