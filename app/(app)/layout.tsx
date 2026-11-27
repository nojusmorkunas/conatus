import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accessibleProjects } from "@/lib/db/access";
import { users } from "@/lib/db/schema";
import { ProjectSidebar } from "@/components/projects/project-sidebar";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { BetaInviteDialog } from "@/components/beta-invite-dialog";
import { betaInviteFor } from "@/lib/beta-invites";
import { Toaster } from "@/components/ui/toast";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { SyncStatus } from "@/components/offline/sync-status";
import { DatePreferencesProvider } from "@/components/date-input";
import { OfflineProvider } from "@/components/offline/offline-provider";
// Read on the server so the client bundle carries the version string, not the whole package.json.
import { version } from "@/package.json";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const [userProjects, [account]] = await Promise.all([
    accessibleProjects(user),
    db
      .select({
        username: users.username,
        name: users.name,
        image: users.image,
        timezone: users.timezone,
        dateFormat: users.dateFormat,
        weekStart: users.weekStart,
        updatedAt: users.updatedAt,
        instanceRole: users.instanceRole,
        onboardingCompletedAt: users.onboardingCompletedAt,
        dismissedBetaInvites: users.dismissedBetaInvites,
        betaInvitesOptOut: users.betaInvitesOptOut,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
  ]);
  if (!account) redirect("/login");

  // A shared project can be someone else's Inbox. Mine is the unshared one.
  const inboxProjectId =
    userProjects.find((project) => project.isInbox && !project.shared)?.id ?? null;
  const betaInvite = betaInviteFor(account);

  return (
    <DatePreferencesProvider dateFormat={account.dateFormat} weekStart={account.weekStart}>
      <OfflineProvider userId={user.id} timeZone={account.timezone} dateFormat={account.dateFormat}>
        <div className="flex h-dvh flex-col md:flex-row">
          <KeyboardShortcuts inboxProjectId={inboxProjectId} />
          <ProjectSidebar
            username={account.username}
            userName={account.name}
            hasAvatar={!!account.image}
            avatarVersion={String(account.updatedAt.getTime())}
            appVersion={version}
            inboxProjectId={inboxProjectId}
          />
          <div className="relative flex min-h-0 min-w-0 flex-1">
            <main className="flex-1 min-w-0 overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
              {children}
            </main>
            <SyncStatus />
          </div>
          <Toaster />
          <ServiceWorkerRegistration />
          <BetaInviteDialog
            invite={betaInvite && {
              id: betaInvite.id,
              title: betaInvite.title,
              body: betaInvite.body,
              joinUrl: betaInvite.joinUrl,
              alternative: betaInvite.alternative,
            }}
          />
        </div>
      </OfflineProvider>
    </DatePreferencesProvider>
  );
}
