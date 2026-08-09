import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";

import { normalizeUsername } from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { checkLoginRateLimit } from "@/lib/auth/login-rate-limit";
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

const providers = [
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
