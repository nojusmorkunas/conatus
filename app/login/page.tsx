import { connection } from "next/server";

import { LoginForm } from "@/components/auth/login-form";
import { oidcProviderName } from "@/lib/auth/oidc";
import { getRegistrationState } from "@/lib/auth/registration";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const registrationState = await getRegistrationState();
  // Auth.js sends failed single sign-on attempts back here with ?error=.
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <LoginForm
          bootstrapAvailable={registrationState.kind === "bootstrap"}
          ssoName={oidcProviderName()}
          ssoFailed={Boolean(error)}
        />
      </div>
    </div>
  );
}
