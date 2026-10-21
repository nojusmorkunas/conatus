import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { enrollUser } from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { registerSchema } from "@/lib/validation";

// Label for the OpenID Connect provider, or null when single sign-on is off.
// Auth.js reads AUTH_OIDC_ISSUER, AUTH_OIDC_ID and AUTH_OIDC_SECRET itself.
export function oidcProviderName() {
  const { AUTH_OIDC_ISSUER, AUTH_OIDC_ID, AUTH_OIDC_SECRET, AUTH_OIDC_NAME } = process.env;
  if (!AUTH_OIDC_ISSUER || !AUTH_OIDC_ID || !AUTH_OIDC_SECRET) return null;
  return AUTH_OIDC_NAME?.trim() || "SSO";
}

type Claims = { iss: string; sub: string; preferred_username?: unknown; email?: unknown };

export function usernameFromClaims(claims: Omit<Claims, "iss" | "sub">) {
  const emailName = typeof claims.email === "string" ? claims.email.split("@")[0] : undefined;
  for (const candidate of [claims.preferred_username, emailName]) {
    const parsed = registerSchema.shape.username.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return "user";
}

// Returns the account to sign in as, or null when linking is refused. Accounts
// are matched only by issuer + subject, never by username or email, so an
// identity provider account cannot take over an existing local one. Existing
// users link from settings while signed in (linkToUserId).
export async function resolveOidcUser({
  claims,
  linkToUserId,
  timezone,
}: {
  claims: Claims;
  linkToUserId?: string;
  timezone?: string;
}) {
  const identity = `${claims.iss} ${claims.sub}`;
  const [linked] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.oidcIdentity, identity))
    .limit(1);

  if (linkToUserId) {
    if (linked) return linked.id === linkToUserId ? linked : null;
    const [user] = await db
      .update(users)
      .set({ oidcIdentity: identity, updatedAt: new Date() })
      .where(and(eq(users.id, linkToUserId), isNull(users.oidcIdentity)))
      .returning({ id: users.id, username: users.username });
    return user ?? null;
  }
  if (linked) return linked;

  const base = usernameFromClaims(claims);
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, base))
    .limit(1);
  const username = taken ? `${base.slice(0, 23)}-${randomBytes(4).toString("hex")}` : base;

  return enrollUser({
    username,
    passwordHash: null,
    oidcIdentity: identity,
    timezone,
    skipInvite: true,
  });
}
