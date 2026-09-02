import { afterEach, describe, expect, it, vi } from "vitest";

import { completeRecurring } from "./recurring-complete";

function mockResponse(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => body }));
}

afterEach(() => vi.unstubAllGlobals());

describe("completeRecurring", () => {
  it("undoes an advanced occurrence by restoring the old due date", async () => {
    mockResponse({ id: "t1", dueDate: "2026-08-25", isCompleted: false });

    const result = await completeRecurring({ id: "t1", dueDate: "2026-08-18" });

    expect(result?.updated.dueDate).toBe("2026-08-25");
    expect(result?.undo).toEqual({ dueDate: "2026-08-18" });
  });

  it("undoes the final occurrence by uncompleting it", async () => {
    mockResponse({ id: "t1", dueDate: "2026-08-18", isCompleted: true });

    const result = await completeRecurring({ id: "t1", dueDate: "2026-08-18" });

    expect(result?.undo).toEqual({ completed: false });
  });

  it("reports failure instead of inventing an undo", async () => {
    mockResponse({}, false);

    expect(await completeRecurring({ id: "t1", dueDate: "2026-08-18" })).toBeNull();
  });
});
