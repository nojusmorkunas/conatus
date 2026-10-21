"use client";

import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";

// The signIn callback in auth.ts reads both cookies: oidc_tz seeds a new
// account's timezone, oidc_link links the identity to the signed-in account.
export function SsoButton({
  link = false,
  children,
}: {
  link?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        const attributes = "; path=/; max-age=600; samesite=lax";
        document.cookie = `oidc_tz=${Intl.DateTimeFormat().resolvedOptions().timeZone}${attributes}`;
        document.cookie = link ? `oidc_link=1${attributes}` : "oidc_link=; path=/; max-age=0";
        void signIn("oidc", { redirectTo: link ? "/settings#sso" : "/" });
      }}
    >
      {children}
    </Button>
  );
}
