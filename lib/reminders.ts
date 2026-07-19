import { and, eq, isNull, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects, reminders, tasks, users } from "@/lib/db/schema";
import { reportError } from "@/lib/error-reporter";
import { isEmailConfigured, transporter } from "@/lib/mailer";

// Runs every minute (see lib/jobs.ts). Leaves sentAt unset on failure so
// the next tick retries; one reminder's send failure must not block the
// rest of the batch.
export async function sendDueReminders() {
  if (!isEmailConfigured()) return;

  const due = await db
    .select({
      id: reminders.id,
      remindAt: reminders.remindAt,
      taskContent: tasks.content,
      dueDate: tasks.dueDate,
      dueTime: tasks.dueTime,
      projectName: projects.name,
      userEmail: users.email,
    })
    .from(reminders)
    .innerJoin(tasks, eq(reminders.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(users, eq(reminders.userId, users.id))
    .where(and(lte(reminders.remindAt, new Date()), isNull(reminders.sentAt)));

  for (const reminder of due) {
    if (!reminder.userEmail) continue;
    try {
      const due = reminder.dueDate
        ? `${reminder.dueDate}${reminder.dueTime ? ` ${reminder.dueTime}` : ""}`
        : "no due date";
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: reminder.userEmail,
        subject: `Reminder: ${reminder.taskContent}`,
        text: `${reminder.taskContent}\n\nDue: ${due}\nProject: ${reminder.projectName}`,
      });
      await db
        .update(reminders)
        .set({ sentAt: new Date() })
        .where(eq(reminders.id, reminder.id));
    } catch (error) {
      reportError(error, { source: "reminders", reminderId: reminder.id });
    }
  }
}
