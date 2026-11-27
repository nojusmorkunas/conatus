import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { CompletedTaskList } from "@/components/tasks/completed-task-list";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";

export default async function CompletedPage() {
  const user = await requireUser();
  if (!user) return null;

  const [settings] = await db
    .select({ timezone: users.timezone, dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:p-6">
      <MobilePageHeader className="mb-6">
        <h1 className="text-xl font-semibold">Completed</h1>
      </MobilePageHeader>
      <CompletedTaskList timezone={settings.timezone} dateFormat={settings.dateFormat} />
    </div>
  );
}
