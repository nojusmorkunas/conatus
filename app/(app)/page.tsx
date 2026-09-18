import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjects } from "@/lib/db/access";
import { users } from "@/lib/db/schema";
import { startPageHref, startPageViews } from "@/lib/start-page";

export default async function Home() {
  const user = await requireUser();
  if (!user) return null;

  const [account] = await db
    .select({
      onboardingCompletedAt: users.onboardingCompletedAt,
      startPage: users.startPage,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!account?.onboardingCompletedAt) redirect("/onboarding");

  // Only landing on a project needs the project list; a plain view redirects
  // without touching the table.
  const view = startPageViews.find((candidate) => candidate.value === account.startPage);
  if (view?.href) redirect(view.href);

  const projects = await accessibleProjects(user.id);
  redirect(
    startPageHref(account.startPage, {
      inboxProjectId: projects.find((project) => project.isInbox && !project.shared)?.id ?? null,
      projectIds: projects.map((project) => project.id),
    }),
  );
}
