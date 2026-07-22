import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { filters, labels } from "@/lib/db/schema";
import { FiltersLabelsManager } from "@/components/filters-labels/filters-labels-manager";

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
      <FiltersLabelsManager initialFilters={userFilters} initialLabels={userLabels} />
    </div>
  );
}
