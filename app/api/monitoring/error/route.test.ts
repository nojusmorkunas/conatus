import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/error-reporter", () => ({ reportError: vi.fn() }));

import { clearRateLimits } from "@/lib/rate-limit";

import { POST } from "./route";

function makeRequest(ip: string) {
  return new Request("https://example.test/api/monitoring/error", {
    method: "POST",
    body: JSON.stringify({ message: "boom" }),
    headers: { "x-forwarded-for": ip },
  });
}

describe("POST /api/monitoring/error", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  afterEach(() => {
    clearRateLimits();
  });

  test("returns ok for a request under the limit", async () => {
    const response = await POST(makeRequest("203.0.113.1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("returns 429 with Retry-After once the limit is exceeded", async () => {
    const ip = "203.0.113.2";

    for (let i = 0; i < 30; i++) {
      const response = await POST(makeRequest(ip));
      expect(response.status).toBe(200);
    }

    const limited = await POST(makeRequest(ip));

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(await limited.json()).toEqual({
      error: "Too many requests. Please try again later.",
    });
  });

  test("keeps distinct IPs independent", async () => {
    for (let i = 0; i < 30; i++) {
      await POST(makeRequest("203.0.113.3"));
    }
    expect((await POST(makeRequest("203.0.113.3"))).status).toBe(429);

    // One flooding client must not spend another client's budget.
    expect((await POST(makeRequest("203.0.113.4"))).status).toBe(200);
  });
});
