import { requireUser } from "@/lib/auth/session";
import { FiltersLabelsManager } from "@/components/filters-labels/filters-labels-manager";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";
import { StoreReady } from "@/lib/offline/hooks";

export default async function FiltersLabelsPage() {
  const user = await requireUser();
  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <MobilePageHeader className="mb-8">
        <h1 className="text-xl font-semibold">Filters &amp; Labels</h1>
      </MobilePageHeader>
      <StoreReady>
        <FiltersLabelsManager />
      </StoreReady>
    </div>
  );
}
