import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { TodoistImporter } from "@/components/import/todoist-importer";
import { requireSessionUser } from "@/lib/auth/session";

export default async function TodoistImportPage() {
  const user = await requireSessionUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-4xl p-6 pb-16">
      <Link href="/settings#data" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        Back to settings
      </Link>
      <div className="mb-7">
        <p className="text-sm font-medium text-muted-foreground">Data migration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Import from Todoist</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Bring over projects, sections, nested tasks, dates, deadlines, recurring schedules, descriptions, and notes from a Todoist backup.
        </p>
      </div>
      <TodoistImporter />
    </main>
  );
}
