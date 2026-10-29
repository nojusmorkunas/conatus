import { eq } from "drizzle-orm";

import { invalid, unauthorized } from "@/lib/api/responses";
import { generateAgentToken } from "@/lib/auth/api-token";
import { redeemDeviceLoginCode } from "@/lib/auth/device-login";
import { agentTokenScopes } from "@/lib/token-access";
import {
  LOGIN_RETRY_AFTER_SECONDS,
  checkLoginRateLimit,
} from "@/lib/auth/login-rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { normalizeUsername } from "@/lib/auth/registration";
import { requireApiActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { apiTokens, users } from "@/lib/db/schema";
import { deviceCodeExchangeSchema, deviceTokenSchema } from "@/lib/validation";

// POST is the one unauthenticated route under /api/v1: native clients cannot hold
// a browser session, so this trades credentials or a one-time PKCE code for a token.
// The token is listed and revocable alongside every other token in settings.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body && typeof body === "object" && "code" in body) {
    const parsed = deviceCodeExchangeSchema.safeParse(body);
    if (!parsed.success) return invalid(parsed.error);

    const redeemed = await redeemDeviceLoginCode(parsed.data.code, parsed.data.codeVerifier);
    if (!redeemed) {
      return Response.json({ error: "Invalid or expired code" }, { status: 401 });
    }
    return createDeviceToken(redeemed.userId, redeemed.deviceName);
  }

  const parsed = deviceTokenSchema.safeParse(body);
  if (!parsed.success) {
    return invalid(parsed.error);
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

  return createDeviceToken(user.id, parsed.data.deviceName);
}

async function createDeviceToken(userId: string, deviceName: string) {
  const generated = generateAgentToken();
  // No expiry: a phone that silently stops syncing after 90 days reads as data
  // loss. Revocation is the control, not rotation.
  const [token] = await db
    .insert(apiTokens)
    .values({
      userId,
      name: deviceName,
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

// Signing out of an app: the token revokes itself, as revoking it in settings would.
export async function DELETE() {
  const actor = await requireApiActor();
  if (!actor?.tokenId) return unauthorized();

  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(eq(apiTokens.id, actor.tokenId));

  return new Response(null, { status: 204 });
}
