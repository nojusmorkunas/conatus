import { connection } from "next/server";
import Link from "next/link";

import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { RegisterForm } from "@/components/auth/register-form";
import { getConfiguredOAuthProviders } from "@/lib/auth/oauth-providers";
import { getRegistrationState } from "@/lib/auth/registration";

const oauthErrors: Record<string, string> = {
  registration_invite_required: "Registration requires an administrator invitation.",
  registration_invite_invalid: "This signup link is invalid, expired, or already used.",
  registration_email_mismatch: "This invitation was issued for a different email address.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; invite?: string; oauthError?: string }>;
}) {
  await connection();
  const { email, invite, oauthError } = await searchParams;
  const providers = getConfiguredOAuthProviders();
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

  const invitedEmail = state.kind === "invited" ? state.email : null;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {oauthError && (
          <p className="mb-4 text-sm text-destructive">
            {oauthErrors[oauthError] ?? "Could not create an account with that provider."}
          </p>
        )}
        <RegisterForm
          defaultEmail={invitedEmail ?? email}
          inviteToken={invite}
          bootstrap={state.kind === "bootstrap"}
          emailLocked={Boolean(invitedEmail)}
        />
        <OAuthButtons providers={providers} inviteToken={invite} />
      </div>
    </div>
  );
}
