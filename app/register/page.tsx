import { connection } from "next/server";
import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
import { getRegistrationState } from "@/lib/auth/registration";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string; invite?: string }>;
}) {
  await connection();
  const { username, invite } = await searchParams;
  const state = await getRegistrationState(invite);

  if (state.kind === "closed") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-3">
          <h1 className="text-xl font-semibold">Registration is invite-only</h1>
          <p className="text-sm text-muted-foreground">
            {state.reason === "invalid_invite"
              ? "This signup link is invalid, expired, or has already been used."
              : "Ask the server administrator for a signup link."}
          </p>
          <Link href="/login" className="text-sm underline underline-offset-4">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  const invitedUsername = state.kind === "invited" ? state.username : null;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <RegisterForm
          defaultUsername={invitedUsername ?? username}
          inviteToken={invite}
          bootstrap={state.kind === "bootstrap"}
          usernameLocked={Boolean(invitedUsername)}
        />
      </div>
    </div>
  );
}
