import { PgBoss } from "pg-boss";

import { WEBHOOK_DELIVERY_QUEUE } from "./webhooks";

// Reuse across dev HMR reloads, same reasoning as lib/db/index.ts.
const globalForJobs = globalThis as unknown as { pgBoss?: PgBoss };

export const boss =
  globalForJobs.pgBoss ?? new PgBoss(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") globalForJobs.pgBoss = boss;

export const REMINDERS_DUE_QUEUE = "reminders-due";

let started: Promise<void> | null = null;

// Polling design instead of one scheduled job per reminder: self-healing
// (a missed tick just catches up next minute) with no job/row sync problem
// when a reminder is edited or deleted.
export function startReminderWorker() {
  started ??= (async () => {
    await boss.start();
    await boss.createQueue(REMINDERS_DUE_QUEUE);
    await boss.createQueue(WEBHOOK_DELIVERY_QUEUE);
    await boss.schedule(REMINDERS_DUE_QUEUE, "* * * * *");
    const { sendDueReminders } = await import("./reminders");
    const { deliverWebhooks } = await import("./webhooks");
    await boss.work(REMINDERS_DUE_QUEUE, sendDueReminders);
    await boss.work(WEBHOOK_DELIVERY_QUEUE, deliverWebhooks);
  })();
  return started;
}
