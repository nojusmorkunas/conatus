import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { requireApiActor, saved, deleted } = vi.hoisted(() => ({
  requireApiActor: vi.fn(),
  saved: [] as unknown[],
  deleted: [] as unknown[],
}));

vi.mock("@/lib/auth/session", () => ({ requireApiActor }));
vi.mock("@/lib/jobs", () => ({ boss: {}, PUSH_DELIVERY_QUEUE: "push-deliver" }));
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: (values: unknown) => ({ onConflictDoUpdate: async () => { saved.push(values); } }),
    }),
    delete: () => ({ where: async (condition: unknown) => { deleted.push(condition); } }),
  },
}));

import { DELETE, PUT } from "./route";

const device = { id: "user", tokenId: "token", projectIds: null, scopes: [], authType: "token" };

function put(body: unknown) {
  return PUT(new Request("https://example.test/api/v1/push/subscription", {
    method: "PUT",
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  requireApiActor.mockResolvedValue(device);
});

afterEach(() => {
  saved.length = 0;
  deleted.length = 0;
});

describe("PUT /api/v1/push/subscription", () => {
  test("saves the address for the device token", async () => {
    const response = await put({ url: "https://relay.example.com/fcm-token" });
    expect(response.status).toBe(204);
    expect(saved).toEqual([expect.objectContaining({ tokenId: "token", url: "https://relay.example.com/fcm-token" })]);
  });

  test("needs a device token, not a browser session", async () => {
    requireApiActor.mockResolvedValue({ ...device, tokenId: null, authType: "session" });
    expect((await put({ url: "https://relay.example.com/fcm-token" })).status).toBe(401);
    requireApiActor.mockResolvedValue(null);
    expect((await put({ url: "https://relay.example.com/fcm-token" })).status).toBe(401);
    expect(saved).toHaveLength(0);
  });

  test.each([
    {},
    { url: "relay" },
    { url: "http://relay.example.com/fcm-token" },
    { url: "https://192.168.1.10/up" },
    { url: `https://relay.example.com/${"a".repeat(2048)}` },
  ])("refuses %j", async (body) => {
    expect((await put(body)).status).toBe(400);
    expect(saved).toHaveLength(0);
  });
});

describe("DELETE /api/v1/push/subscription", () => {
  test("removes the device's address", async () => {
    expect((await DELETE()).status).toBe(204);
    expect(deleted).toHaveLength(1);
  });

  test("needs a device token", async () => {
    requireApiActor.mockResolvedValue(null);
    expect((await DELETE()).status).toBe(401);
    expect(deleted).toHaveLength(0);
  });
});
