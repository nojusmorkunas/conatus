import { eq } from "drizzle-orm";

import { agentTokenScopes, generateAgentToken } from "@/lib/auth/api-token";
import {
  LOGIN_RETRY_AFTER_SECONDS,
  checkLoginRateLimit,
} from "@/lib/auth/login-rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { normalizeUsername } from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { apiTokens, users } from "@/lib/db/schema";
import { deviceTokenSchema } from "@/lib/validation";

// The one unauthenticated route under /api/v1: native clients cannot hold a
// browser session, so this trades a password for a token they store instead.
// The token is listed and revocable alongside every other token in settings.
export async function POST(request: Request) {
  const parsed = deviceTokenSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const username = normalizeUsername(parsed.data.username);
  if (!checkLoginRateLimit(username, request)) {
    return Response.json(
      { error: "Too many attempts" },
      {
        status: 429,
        headers: { "Retry-After": String(LOGIN_RETRY_AFTER_SECONDS) },
      },
    );
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (
    !user ||
    user.passwordHash === null ||
    !(await verifyPassword(parsed.data.password, user.passwordHash))
  ) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const generated = generateAgentToken();
  // No expiry: a phone that silently stops syncing after 90 days reads as data
  // loss. Revocation is the control, not rotation.
  const [token] = await db
    .insert(apiTokens)
    .values({
      userId: user.id,
      name: parsed.data.deviceName,
      tokenHash: generated.hash,
      prefix: generated.prefix,
      scopes: [...agentTokenScopes],
      expiresAt: null,
    })
    .returning({
      id: apiTokens.id,
      name: apiTokens.name,
      scopes: apiTokens.scopes,
      createdAt: apiTokens.createdAt,
    });

  return Response.json({ ...token, token: generated.raw }, { status: 201 });
}
