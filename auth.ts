import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import {
  isOAuthProvider,
  isOAuthProviderConfigured,
} from "@/lib/auth/oauth-providers";
import {
  enrollUser,
  normalizeEmail,
  RegistrationEnrollmentError,
} from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { acceptProjectInvitations } from "@/lib/db/invitations";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { credentialsSchema } from "@/lib/validation";

const LOGIN_IP_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const LOGIN_EMAIL_LIMIT = { limit: 5, windowMs: 5 * 60 * 1000 };

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

class EmailUnverified extends CredentialsSignin {
  code = "email_unverified";
}

class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

const providers: Provider[] = [
  Credentials({
    authorize: async (raw, request) => {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;

      const { email, password } = parsed.data;
      const normalizedEmail = normalizeEmail(email);
      if (request?.headers) {
        const ipLimit = checkRateLimit(
          `login:ip:${getClientIp(request)}`,
          LOGIN_IP_LIMIT,
        );
        if (!ipLimit.ok) throw new RateLimited();
      }
      const emailLimit = checkRateLimit(
        `login:email:${normalizedEmail}`,
        LOGIN_EMAIL_LIMIT,
      );
      if (!emailLimit.ok) throw new RateLimited();

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail));

      if (
        !user ||
        user.passwordHash === null ||
        !(await verifyPassword(password, user.passwordHash))
      ) {
        return null;
      }

      if (!user.emailVerified) {
        throw new EmailUnverified();
      }

      return { id: user.id, email: user.email };
    },
  }),
];

if (isOAuthProviderConfigured("github")) providers.push(GitHub);
if (isOAuthProviderConfigured("google")) providers.push(Google);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    async signIn({ account, profile, user }) {
      if (!account || !isOAuthProvider(account.provider)) return true;

      const providerEmail = profile?.email;
      if (!providerEmail) {
        return account.provider === "github"
          ? "/login?oauthError=github_email_required"
          : "/login?oauthError=google_email_unverified";
      }
      if (account.provider === "google" && profile.email_verified !== true) {
        return "/login?oauthError=google_email_unverified";
      }

      const email = normalizeEmail(providerEmail);
      const [existingUser] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      // Email-based linking is intentional for this small-trust, self-hosted
      // deployment; verified provider email ownership is accepted as proof.
      let databaseUser = existingUser;
      if (!databaseUser) {
        try {
          const inviteToken = (await cookies()).get("registration_invite")?.value;
          databaseUser = await enrollUser({
            email,
            passwordHash: null,
            emailVerified: new Date(),
            inviteToken,
          });
        } catch (error) {
          if (error instanceof RegistrationEnrollmentError) {
            const code =
              error.code === "email_mismatch"
                ? "registration_email_mismatch"
                : error.code === "invalid_invite"
                  ? "registration_invite_invalid"
                  : "registration_invite_required";
            return `/register?oauthError=${code}`;
          }
          throw error;
        }
      }

      if (!existingUser) {
        try {
          await acceptProjectInvitations(db, {
            userId: databaseUser.id,
            email,
          });
        } catch (error) {
          console.error("project invitation acceptance failed", databaseUser.id, error);
        }
      }

      // Auth.js uses this same object to build the initial OAuth JWT.
      user.id = databaseUser.id;
      return true;
    },
    jwt({ token, user, account }) {
      if (account && isOAuthProvider(account.provider)) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      return session;
    },
  },
});
