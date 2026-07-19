import { describe, expect, test, vi } from "vitest";

import { ApiError, TaskApiClient } from "./api-client.js";

const token = `tdm_${"b".repeat(32)}`;

describe("TaskApiClient", () => {
  test("sends authentication and idempotency headers", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ id: "task-1", content: "Ship MCP" }, { status: 201 }),
    );
    const client = new TaskApiClient({
      baseUrl: new URL("https://tasks.example.test"),
      token,
      timeoutMs: 1000,
      fetch: fetchMock,
    });

    await client.createTask(
      { projectId: "project-1", content: "Ship MCP" },
      "request-123",
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://tasks.example.test/api/v1/tasks");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("request-123");
  });

  test("turns API errors into typed errors", async () => {
    const client = new TaskApiClient({
      baseUrl: new URL("https://tasks.example.test"),
      token,
      timeoutMs: 1000,
      fetch: async () => Response.json({ error: "Not found" }, { status: 404 }),
    });

    await expect(client.getTask("missing")).rejects.toEqual(
      expect.objectContaining<ApiError>({ name: "ApiError", status: 404, message: "Not found" }),
    );
  });

  test("encodes list filters and omits unset values", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ items: [], nextCursor: null }),
    );
    const client = new TaskApiClient({
      baseUrl: new URL("https://tasks.example.test"),
      token,
      timeoutMs: 1000,
      fetch: fetchMock,
    });
    await client.listTasks({ completed: false, query: "quarterly plan", limit: 25, cursor: undefined });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://tasks.example.test/api/v1/tasks?completed=false&query=quarterly+plan&limit=25",
    );
  });

  test("normalizes network failures as a 502 API error", async () => {
    const client = new TaskApiClient({
      baseUrl: new URL("https://tasks.example.test"),
      token,
      timeoutMs: 1000,
      fetch: async () => { throw new Error("connection refused"); },
    });
    await expect(client.context()).rejects.toEqual(
      expect.objectContaining<ApiError>({ status: 502, message: "connection refused" }),
    );
  });
});
