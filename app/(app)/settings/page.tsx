import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { apiTokens, registrationInvites, users, webhooks } from "@/lib/db/schema";
import type { SettingsInput } from "@/lib/validation";
import { AccountSettings } from "@/components/account/account-settings";
import { RegistrationInvites } from "@/components/admin/registration-invites";
import { SettingsForm } from "./settings-form";
import { MobilePageHeader } from "@/components/projects/mobile-sidebar-trigger";

export default async function SettingsPage() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser) redirect("/login");

  const [user] = await db
    .select({
      name: users.name,
      timezone: users.timezone,
      dateFormat: users.dateFormat,
      weekStart: users.weekStart,
      dailyGoal: users.dailyGoal,
      icalToken: users.icalToken,
      username: users.username,
      passwordHash: users.passwordHash,
      instanceRole: users.instanceRole,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id));

  const tokens = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scopes: apiTokens.scopes,
      expiresAt: apiTokens.expiresAt,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, sessionUser.id), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));

  const webhookEndpoints = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      isActive: webhooks.isActive,
      failureCount: webhooks.failureCount,
      createdAt: webhooks.createdAt,
    })
    .from(webhooks)
    .where(eq(webhooks.userId, sessionUser.id))
    .orderBy(desc(webhooks.createdAt));

  const signupInvitations = user.instanceRole === "admin"
    ? await db
        .select({
          id: registrationInvites.id,
          username: registrationInvites.username,
          expiresAt: registrationInvites.expiresAt,
          createdAt: registrationInvites.createdAt,
        })
        .from(registrationInvites)
        .where(
          and(
            isNull(registrationInvites.usedAt),
            isNull(registrationInvites.revokedAt),
            gt(registrationInvites.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(registrationInvites.createdAt))
    : [];

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-2 sm:p-6">
      <MobilePageHeader className="mb-6">
        <h1 className="text-xl font-semibold">Settings</h1>
      </MobilePageHeader>
      <div className="lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-10">
        <nav
          aria-label="Settings sections"
          className="mb-1 snap-x overflow-x-auto lg:sticky lg:top-6 lg:mb-0 lg:self-start lg:overflow-visible"
        >
          <div className="flex w-max gap-1 lg:w-auto lg:flex-col">
            {[
              ["account", "Account"],
              ...(user.instanceRole === "admin" ? [["registration", "Registration"]] : []),
              ["preferences", "Preferences"],
              ["appearance", "Appearance"],
              ["calendar-feed", "Calendar feed"],
              ["api-tokens", "API tokens"],
              ["webhooks", "Webhooks"],
              ["data", "Data"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex min-h-11 snap-start items-center whitespace-nowrap rounded-md px-3 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground lg:min-h-0 lg:px-2"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>
        <p className="mb-5 text-xs text-muted-foreground lg:hidden">Swipe sideways for more settings.</p>
        <div className="min-w-0 space-y-8">
          <AccountSettings
            username={user.username}
            hasPassword={user.passwordHash !== null}
          />
          {user.instanceRole === "admin" && (
            <RegistrationInvites
              initialInvitations={signupInvitations.map((invite) => ({
                ...invite,
                expiresAt: invite.expiresAt.toISOString(),
                createdAt: invite.createdAt.toISOString(),
              }))}
            />
          )}
          <SettingsForm
            defaults={{
              name: user.name ?? "",
              timezone: user.timezone,
              dateFormat: user.dateFormat as SettingsInput["dateFormat"],
              weekStart: user.weekStart,
              dailyGoal: user.dailyGoal,
            }}
            icalToken={user.icalToken}
            initialApiTokens={tokens.map((token) => ({
              ...token,
              expiresAt: token.expiresAt?.toISOString() ?? null,
              createdAt: token.createdAt.toISOString(),
              lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
            }))}
            initialWebhooks={webhookEndpoints.map((webhook) => ({
              ...webhook,
              createdAt: webhook.createdAt.toISOString(),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
