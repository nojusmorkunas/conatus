import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";

import { normalizeUsername } from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { credentialsSchema } from "@/lib/validation";

const LOGIN_IP_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const LOGIN_USERNAME_LIMIT = { limit: 5, windowMs: 5 * 60 * 1000 };

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

const providers = [
  Credentials({
    authorize: async (raw, request) => {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;

      const { username, password } = parsed.data;
      const normalizedUsername = normalizeUsername(username);
      if (request?.headers) {
        const ipLimit = checkRateLimit(
          `login:ip:${getClientIp(request)}`,
          LOGIN_IP_LIMIT,
        );
        if (!ipLimit.ok) throw new RateLimited();
      }
      const usernameLimit = checkRateLimit(
        `login:username:${normalizedUsername}`,
        LOGIN_USERNAME_LIMIT,
      );
      if (!usernameLimit.ok) throw new RateLimited();

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

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    session({ session, token }) {
      session.user.id = token.sub!;
      return session;
    },
  },
});
