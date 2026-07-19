import Link from "next/link";
import { eq } from "drizzle-orm";
import { Filter } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { filters, labels } from "@/lib/db/schema";
import { ProjectHashIcon } from "@/components/projects/project-hash-icon";

export default async function FiltersLabelsPage() {
  const user = await requireUser();
  if (!user) return null;

  const [userFilters, userLabels] = await Promise.all([
    db.select().from(filters).where(eq(filters.userId, user.id)).orderBy(filters.order),
    db.select().from(labels).where(eq(labels.userId, user.id)).orderBy(labels.order),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <h1 className="mb-8 text-xl font-semibold">Filters &amp; Labels</h1>
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-base font-semibold">Filters</h2>
          {userFilters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No filters yet.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {userFilters.map((filter) => (
                <Link
                  key={filter.id}
                  href={`/filters/${filter.id}`}
                  className="flex h-10 items-center gap-2 px-3 text-sm hover:bg-muted"
                >
                  <Filter className="size-4 text-muted-foreground" />
                  {filter.name}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold">Labels</h2>
          {userLabels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No labels yet.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {userLabels.map((label) => (
                <div key={label.id} className="flex h-10 items-center gap-2 px-3 text-sm">
                  <ProjectHashIcon color={label.color} />
                  {label.name}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
