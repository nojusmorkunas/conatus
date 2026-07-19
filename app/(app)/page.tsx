import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export default async function Home() {
  const user = await requireUser();
  if (!user) return null;

  const [account] = await db
    .select({ onboardingCompletedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  redirect(account?.onboardingCompletedAt ? "/today" : "/onboarding");
}
