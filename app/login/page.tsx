import { connection } from "next/server";

import { LoginForm } from "@/components/auth/login-form";
import { safeCallbackPath } from "@/lib/auth/callback-url";
import { oidcProviderName } from "@/lib/auth/oidc";
import { getRegistrationState } from "@/lib/auth/registration";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string | string[] }>;
}) {
  await connection();
  const registrationState = await getRegistrationState();
  // Auth.js sends failed single sign-on attempts back here with ?error=.
  const { error, callbackUrl } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <LoginForm
          callbackUrl={safeCallbackPath(typeof callbackUrl === "string" ? callbackUrl : null)}
          bootstrapAvailable={registrationState.kind === "bootstrap"}
          ssoName={oidcProviderName()}
          ssoFailed={Boolean(error)}
        />
      </div>
    </div>
  );
}
