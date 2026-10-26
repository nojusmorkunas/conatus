import { expect, test, vi } from "vitest";

const queries = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return {
    db: drizzle(async (sql) => {
      queries.push(sql);
      return { rows: [] };
    }),
  };
});
vi.mock("@/lib/mailer", () => ({ isEmailConfigured: () => true, transporter: { sendMail: vi.fn() } }));

import { sendDueReminders } from "./reminders";

test("skips reminders on completed tasks", async () => {
  await sendDueReminders();

  expect(queries[0]).toContain('"tasks"."is_completed" = $');
});
