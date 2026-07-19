import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { getConfiguredOAuthProviders } from "@/lib/auth/oauth-providers";
import { getRegistrationState } from "@/lib/auth/registration";

const oauthErrors: Record<string, string> = {
  github_email_required:
    "GitHub did not provide an email address. Add one to your GitHub account and try again.",
  google_email_unverified:
    "Google did not provide a verified email address. Verify it and try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    oauthError?: string | string[];
    passwordReset?: string | string[];
    verificationSent?: string | string[];
  }>;
}) {
  const { oauthError, passwordReset, verificationSent } = await searchParams;
  const errorCode = typeof oauthError === "string" ? oauthError : undefined;
  const providers = getConfiguredOAuthProviders();
  const registrationState = await getRegistrationState();

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <LoginForm
          oauthError={errorCode ? oauthErrors[errorCode] : undefined}
          passwordReset={passwordReset === "true"}
          verificationSent={verificationSent === "true"}
          bootstrapAvailable={registrationState.kind === "bootstrap"}
        />
        <OAuthButtons providers={providers} />
      </div>
    </div>
  );
}
