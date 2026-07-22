import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { CalendarDays, Inbox, Search, SquareCheckBig } from "lucide-react";

import { TodoistImporter } from "@/components/import/todoist-importer";
import { OnboardingSkip } from "@/components/onboarding/onboarding-skip";
import { MobileSidebarTrigger } from "@/components/projects/mobile-sidebar-trigger";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const guide = [
  { Icon: Inbox, title: "Capture", text: "Use New task to put ideas in Inbox before organizing them." },
  { Icon: SquareCheckBig, title: "Organize", text: "Projects, sections, labels and subtasks keep related work together." },
  { Icon: CalendarDays, title: "Plan", text: "Focus shows overdue and due work; Calendar helps you plan ahead." },
  { Icon: Search, title: "Find", text: "Press / anywhere to search tasks, projects and comments." },
];

export default async function OnboardingPage() {
  const user = await requireUser();
  if (!user) redirect("/login");
  const [account] = await db
    .select({ completedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (account?.completedAt) redirect("/today");

  return (
    <div className="mx-auto w-full max-w-5xl p-5 md:p-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <MobileSidebarTrigger />
          <div>
          <p className="text-sm font-medium text-muted-foreground">Welcome</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Set up your workspace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Here is the whole app in a minute. You can start clean or bring your current Todoist workspace with you.
          </p>
          </div>
        </div>
        <OnboardingSkip />
      </header>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Product tutorial">
        {guide.map(({ Icon, title, text }) => (
          <article key={title} className="rounded-xl border bg-card p-4">
            <span className="mb-4 flex size-9 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></span>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
          </article>
        ))}
      </section>

      <TodoistImporter onboarding />
    </div>
  );
}
