import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { hashToken } from "@/lib/auth/api-token";
import { db } from "@/lib/db";
import { apiTokens, users } from "@/lib/db/schema";

export type AuthenticatedActor = {
  id: string;
  tokenId: string | null;
  scopes: string[];
  authType: "session" | "token";
};

// A JWT session is trusted by signature alone, so a cookie can outlive the
// user row it names (e.g. after a database reset). Confirm the user still
// exists before any route acts on session.user.id.
export async function requireSessionUser() {
  const session = await auth();
  if (!session) return null;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return user ?? null;
}

export async function requireApiActor(
  requiredScope?: string,
): Promise<AuthenticatedActor | null> {
  const sessionUser = await requireSessionUser();
  if (sessionUser) {
    return {
      id: sessionUser.id,
      tokenId: null,
      scopes: ["*"],
      authType: "session",
    };
  }

  const authorization = (await headers()).get("authorization");
  const match = authorization?.match(
    /^Bearer ((?:tdc|tdm)_[A-Za-z0-9_-]{32})$/,
  );
  if (!match) return null;

  const [result] = await db
    .select({
      id: users.id,
      tokenId: apiTokens.id,
      scopes: apiTokens.scopes,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.tokenHash, hashToken(match[1])))
    .limit(1);

  if (!result) return null;
  if (result.revokedAt || (result.expiresAt && result.expiresAt <= new Date())) {
    return null;
  }
  if (
    requiredScope &&
    !result.scopes.includes("*") &&
    !result.scopes.includes(requiredScope)
  ) {
    return null;
  }

  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, result.tokenId))
    .catch(() => undefined);

  return {
    id: result.id,
    tokenId: result.tokenId,
    scopes: result.scopes,
    authType: "token",
  };
}

export async function requireUser(requiredScope = "legacy:full") {
  const actor = await requireApiActor(requiredScope);
  return actor ? { id: actor.id } : null;
}
