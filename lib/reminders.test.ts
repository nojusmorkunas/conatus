import { beforeEach, expect, test, vi } from "vitest";

const queries = vi.hoisted(() => [] as string[]);
const dueRows = vi.hoisted(() => [] as unknown[][]);

vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return {
    db: drizzle(async (sql) => {
      queries.push(sql);
      return { rows: sql.startsWith("select") ? dueRows : [] };
    }),
  };
});
vi.mock("@/lib/mailer", () => ({ isEmailConfigured: () => true, transporter: { sendMail: vi.fn() } }));

import { transporter } from "@/lib/mailer";

import { sendDueReminders } from "./reminders";

beforeEach(() => {
  queries.length = 0;
  dueRows.length = 0;
  vi.clearAllMocks();
});

test("skips reminders on completed tasks", async () => {
  await sendDueReminders();

  expect(queries[0]).toContain('"tasks"."is_completed" = $');
});

test("marks disabled email reminders sent without sending mail", async () => {
  dueRows.push([
    "reminder-id",
    new Date().toISOString(),
    "A task",
    null,
    null,
    "Inbox",
    "user@example.com",
    false,
  ]);

  await sendDueReminders();

  expect(transporter.sendMail).not.toHaveBeenCalled();
  expect(queries).toHaveLength(2);
  expect(queries[1]).toContain('update "reminders" set "sent_at" = $1');
  expect(queries[1]).toContain('where "reminders"."id" = $2');
});
