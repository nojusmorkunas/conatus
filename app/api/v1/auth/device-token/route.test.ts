import { beforeEach, describe, expect, test, vi } from "vitest";

// No user row matches, so every attempt lands on the invalid-credentials path.
// That is the branch worth pinning: it must not leak whether the name exists.
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  },
}));

import { clearRateLimits } from "@/lib/rate-limit";

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://example.test/api/v1/auth/device-token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-forwarded-for": "203.0.113.1" },
  });
}

const credentials = { username: "ana", password: "secret", deviceName: "Pixel" };

describe("POST /api/v1/auth/device-token", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  test("rejects a body with no device name", async () => {
    const response = await POST(makeRequest({ username: "ana", password: "secret" }));
    expect(response.status).toBe(400);
  });

  test("rejects a body that is not JSON", async () => {
    const response = await POST(
      new Request("https://example.test/api/v1/auth/device-token", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(response.status).toBe(400);
  });

  test("answers unknown credentials without saying which part was wrong", async () => {
    const response = await POST(makeRequest(credentials));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid credentials" });
  });

  test("shares the login rate limit budget", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await POST(makeRequest(credentials))).status).toBe(401);
    }

    const blocked = await POST(makeRequest(credentials));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("300");
  });
});
