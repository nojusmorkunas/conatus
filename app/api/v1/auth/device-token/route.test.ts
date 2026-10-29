import { beforeEach, describe, expect, test, vi } from "vitest";

const { requireApiActor, revoked } = vi.hoisted(() => ({
  requireApiActor: vi.fn(),
  revoked: [] as unknown[],
}));

// No user or code row matches; replies must not leak whether a name exists.
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    delete: () => ({ where: () => ({ returning: async () => [] }) }),
    update: () => ({ set: (values: unknown) => ({ where: async () => { revoked.push(values); } }) }),
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireApiActor }));

import { clearRateLimits } from "@/lib/rate-limit";

import { DELETE, POST } from "./route";

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

  test("rejects an unknown code with a valid-format verifier", async () => {
    const response = await POST(makeRequest({ code: "unknown", codeVerifier: "a".repeat(43) }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid or expired code" });
  });

  test("rejects a malformed code verifier", async () => {
    const response = await POST(makeRequest({ code: "unknown", codeVerifier: "short" }));
    expect(response.status).toBe(400);
  });

  test("exchanges codes without using the credentials rate limit", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await POST(makeRequest(credentials));
    }

    const response = await POST(makeRequest({ code: "unknown", codeVerifier: "a".repeat(43) }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid or expired code" });
  });
});

describe("DELETE /api/v1/auth/device-token", () => {
  beforeEach(() => {
    revoked.length = 0;
  });

  test("needs a token, not a browser session", async () => {
    requireApiActor.mockResolvedValueOnce({ id: "user", tokenId: null });
    expect((await DELETE()).status).toBe(401);
    requireApiActor.mockResolvedValueOnce(null);
    expect((await DELETE()).status).toBe(401);
    expect(revoked).toHaveLength(0);
  });

  test("revokes the token that sent it", async () => {
    requireApiActor.mockResolvedValueOnce({ id: "user", tokenId: "token" });
    expect((await DELETE()).status).toBe(204);
    expect(revoked).toEqual([{ revokedAt: expect.any(Date) }]);
  });
});
