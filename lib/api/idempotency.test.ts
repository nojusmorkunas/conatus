import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { withIdempotency } from "./idempotency";

describe("withIdempotency boundary behavior", () => {
  test("passes through requests without a key", async () => {
    const handler = vi.fn(async () => Response.json({ created: true }, { status: 201 }));
    const response = await withIdempotency(
      new Request("https://example.test/api/v1/tasks", { method: "POST", body: "{}" }),
      { userId: "user", operation: "tasks.create" },
      handler,
    );
    expect(response.status).toBe(201);
    expect(handler).toHaveBeenCalledOnce();
  });

  test.each(["", "x".repeat(201)])("rejects invalid key %# before mutation", async (key) => {
    const handler = vi.fn(async () => Response.json({ created: true }));
    const response = await withIdempotency(
      new Request("https://example.test/api/v1/tasks", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: "{}",
      }),
      { userId: "user", operation: "tasks.create" },
      handler,
    );
    expect(response.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });
});
