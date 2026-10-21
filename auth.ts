import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { normalizeUsername } from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { checkLoginRateLimit } from "@/lib/auth/login-rate-limit";
import { oidcProviderName, resolveOidcUser } from "@/lib/auth/oidc";
import { verifyPassword } from "@/lib/auth/password";
import { credentialsSchema } from "@/lib/validation";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

const providers: Provider[] = [
  Credentials({
    authorize: async (raw, request) => {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;

      const { username, password } = parsed.data;
      const normalizedUsername = normalizeUsername(username);
      if (!checkLoginRateLimit(normalizedUsername, request as Request | undefined)) {
        throw new RateLimited();
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, normalizedUsername));

      if (
        !user ||
        user.passwordHash === null ||
        !(await verifyPassword(password, user.passwordHash))
      ) {
        return null;
      }

      return { id: user.id, name: user.username };
    },
  }),
];

const oidcName = oidcProviderName();
if (oidcName) providers.push({ id: "oidc", name: oidcName, type: "oidc" });

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    async signIn({ user, account, profile }): Promise<boolean | string> {
      if (account?.provider !== "oidc") return true;
      if (!profile?.sub || typeof profile.iss !== "string") return false;

      // Both cookies are set by components/auth/sso-button.tsx.
      const cookieStore = await cookies();
      const linking = cookieStore.has("oidc_link");
      cookieStore.delete("oidc_link");
      const timezone = cookieStore.get("oidc_tz")?.value;
      cookieStore.delete("oidc_tz");

      const databaseUser = await resolveOidcUser({
        claims: { ...profile, iss: profile.iss, sub: profile.sub },
        linkToUserId: linking ? (await auth())?.user.id : undefined,
        timezone:
          timezone && Intl.supportedValuesOf("timeZone").includes(timezone)
            ? timezone
            : undefined,
      });
      if (!databaseUser) return "/settings?sso=conflict#sso";

      // Auth.js builds the session token from this same object.
      user.id = databaseUser.id;
      user.name = databaseUser.username;
      return true;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      return session;
    },
  },
});
