import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { nativeAppRedirect } from "@/lib/native-app";
import { deviceLoginRequestSchema } from "@/lib/validation";

export default async function DeviceLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string | string[]; challenge?: string | string[] }>;
}) {
  const parsed = deviceLoginRequestSchema.safeParse(await searchParams);
  if (!parsed.success) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="text-sm text-muted-foreground">
            This sign-in link is incomplete. Start signing in again from the app.
          </p>
        </div>
      </div>
    );
  }

  const { device, challenge } = parsed.data;
  const callbackUrl = `/device-login?${new URLSearchParams({ device, challenge })}`;
  const loginUrl = `/login?${new URLSearchParams({ callbackUrl })}`;
  const sessionUser = await requireSessionUser();
  if (!sessionUser) redirect(loginUrl);

  const [user] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!user) redirect(loginUrl);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Sign in on {device}?</h1>
        <p className="text-sm text-muted-foreground">
          The Conatus app on {device} will get full access to your tasks, projects
          and settings. You can revoke it under API tokens in Settings.
        </p>
        <p className="text-sm text-muted-foreground">Signed in as {user.username}.</p>
        <form method="post" action="/api/device-login" className="flex gap-2">
          <input type="hidden" name="device" value={device} />
          <input type="hidden" name="challenge" value={challenge} />
          <Button type="submit">Allow</Button>
          <a
            href={`${nativeAppRedirect}?error=access_denied`}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </a>
        </form>
      </div>
    </div>
  );
}
