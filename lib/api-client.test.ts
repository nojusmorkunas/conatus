import { afterEach, describe, expect, test, vi } from "vitest";

import { api, ApiError } from "./api-client";

describe("api-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "1", name: "Inbox" }), { status: 200 }),
      ),
    );

    await expect(
      api.get<{ id: string; name: string }>("/api/projects/1"),
    ).resolves.toEqual({ id: "1", name: "Inbox" });
  });

  test("throws an ApiError with the server's message for a string error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
      ),
    );

    await expect(api.get("/api/projects/missing")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Not found",
    });
  });

  test("throws an ApiError with a usable message for a Zod field-errors body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { content: ["Required"], priority: ["Invalid"] } }),
          { status: 400 },
        ),
      ),
    );

    const caught = await api.post("/api/tasks", { content: "" }).catch((thrown: unknown) => thrown);
    const error = caught as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe("Required");
    expect(error.fields).toEqual({ content: ["Required"], priority: ["Invalid"] });
  });

  test("throws cleanly instead of a JSON parse error when the body isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>Server Error</html>", { status: 500 })),
    );

    await expect(api.get("/api/projects")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
    });
  });

  test("throws cleanly on an empty error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(api.delete("/api/filters/1")).rejects.toBeInstanceOf(ApiError);
  });

  test("sends JSON bodies with Content-Type set automatically", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.patch("/api/tasks/1", { completed: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tasks/1");
    expect(init).toMatchObject({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
  });

  test("does not set a manual Content-Type for FormData bodies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.set("file", new Blob(["hi"]), "note.txt");

    await api.post("/api/attachments", form);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toBeUndefined();
    expect(init.body).toBe(form);
  });

  test("DELETE with no body sends no body and no Content-Type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.delete("/api/filters/1");

    const [, init] = fetchMock.mock.calls[0];
    expect(init).toEqual({ method: "DELETE" });
  });
});
