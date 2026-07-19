import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const resetToken = typeof token === "string" ? token : "";

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {resetToken ? (
          <ResetPasswordForm token={resetToken} />
        ) : (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold">Invalid reset link</h1>
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or has expired.
            </p>
            <Link
              href="/forgot-password"
              className="text-sm underline underline-offset-4"
            >
              Request a new reset link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
