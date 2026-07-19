import { signIn } from "@/auth";
import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import type { OAuthProviderId } from "@/lib/auth/oauth-providers";

export function OAuthButtons({
  providers,
  inviteToken,
}: {
  providers: { id: OAuthProviderId; name: string }[];
  inviteToken?: string;
}) {
  if (providers.length === 0) return null;

  return (
    <div className="mt-6 flex flex-col gap-2">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      {providers.map((provider) => (
        <form
          key={provider.id}
          action={async () => {
            "use server";
            const cookieStore = await cookies();
            if (inviteToken) {
              cookieStore.set("registration_invite", inviteToken, {
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 15 * 60,
              });
            } else {
              cookieStore.delete("registration_invite");
            }
            await signIn(provider.id, { redirectTo: "/" });
          }}
        >
          <Button type="submit" variant="outline" className="w-full">
            Continue with {provider.name}
          </Button>
        </form>
      ))}
    </div>
  );
}
