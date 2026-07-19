import { afterEach, describe, expect, test, vi } from "vitest";

import { reportError } from "./error-reporter";

describe("reportError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("normalizes non-Error values and writes a structured log", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    reportError({ reason: "unexpected" }, { source: "test" });

    expect(consoleError).toHaveBeenCalledWith(
      "[error-report]",
      expect.objectContaining({
        level: "error",
        message: "[object Object]",
        name: "NonError",
        context: { source: "test" },
        runtime: "nodejs",
      }),
    );
  });

  test("posts the structured record when a webhook is configured", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://monitoring.example/errors");
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    reportError(new Error("failed"), { requestId: "abc" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://monitoring.example/errors",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      level: "error",
      message: "failed",
      name: "Error",
      context: { requestId: "abc" },
    });
  });

  test("never throws when webhook delivery rejects", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://monitoring.example/errors");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => reportError("failed")).not.toThrow();
    await Promise.resolve();
  });
});
