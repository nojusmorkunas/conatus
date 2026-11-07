import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { requireSessionUser, updates } = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/auth/session", () => ({ requireSessionUser }));
vi.mock("@/lib/beta-invites", () => ({ currentBetaInvite: { id: "android-test" } }));
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push(values);
        },
      }),
    }),
  },
}));

import { POST } from "./route";

function post(body: unknown) {
  return POST(new Request("https://example.test/api/beta-invite", {
    method: "POST",
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  requireSessionUser.mockResolvedValue({ id: "user", projectIds: null });
});

afterEach(() => {
  updates.length = 0;
});

describe("POST /api/beta-invite", () => {
  test("records the invite as seen", async () => {
    expect((await post({ inviteId: "android-test" })).status).toBe(204);
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0])).toEqual(["seenBetaInvites"]);
  });

  test("opts out of every beta invite", async () => {
    expect((await post({ inviteId: "android-test", optOut: true })).status).toBe(204);
    expect(updates).toEqual([expect.objectContaining({ betaInvitesOptOut: true })]);
  });

  test("needs a browser session", async () => {
    requireSessionUser.mockResolvedValue(null);
    expect((await post({ inviteId: "android-test" })).status).toBe(401);
    expect(updates).toHaveLength(0);
  });

  test("ignores invites that are not current", async () => {
    expect((await post({ inviteId: "something-else" })).status).toBe(404);
    expect(updates).toHaveLength(0);
  });

  test.each([{}, { inviteId: "" }, { inviteId: "android-test", optOut: "yes" }])(
    "refuses %j",
    async (body) => {
      expect((await post(body)).status).toBe(400);
      expect(updates).toHaveLength(0);
    },
  );
});
