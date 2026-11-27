import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { CalendarView } from "@/components/calendar/calendar-view";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";

export default async function CalendarPage() {
  const user = await requireUser();
  if (!user) return null;

  const [settings] = await db
    .select({ dateFormat: users.dateFormat, weekStart: users.weekStart })
    .from(users)
    .where(eq(users.id, user.id));

  return (
    <div className="flex h-full w-full flex-col px-3 py-2 sm:p-6">
      <MobilePageHeader className="mb-4">
        <h1 className="text-xl font-semibold">Calendar</h1>
      </MobilePageHeader>
      <CalendarView dateFormat={settings.dateFormat} weekStart={settings.weekStart} />
    </div>
  );
}
