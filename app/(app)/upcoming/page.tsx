import { eq } from "drizzle-orm";
import { CalendarDays } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { UpcomingScreen } from "@/components/tasks/task-date-screens";
import { EmptyState } from "@/components/ui/empty-state";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";

export default async function UpcomingPage() {
  const user = await requireUser();
  if (!user) return null;

  const [settings] = await db
    .select({ dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:p-6">
      <MobilePageHeader className="mb-6">
        <h1 className="text-xl font-semibold">Upcoming</h1>
      </MobilePageHeader>
      <UpcomingScreen
        currentUserId={user.id}
        dateFormat={settings.dateFormat}
        emptyState={<EmptyState icon={CalendarDays} title="Nothing coming up" description="Add dates to tasks to plan what is next." />}
      />
    </div>
  );
}
