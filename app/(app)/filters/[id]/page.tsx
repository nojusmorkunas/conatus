import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { FilterScreen } from "@/components/tasks/task-date-screens";

export default async function FilterPage() {
  const user = await requireUser();
  if (!user) return null;

  const [settings] = await db
    .select({ dateFormat: users.dateFormat })
    .from(users)
    .where(eq(users.id, user.id));

  return <FilterScreen currentUserId={user.id} dateFormat={settings.dateFormat} />;
}
