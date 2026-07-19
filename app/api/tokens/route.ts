import { and, desc, eq, isNull } from "drizzle-orm";

import {
  agentDefaultScopes,
  agentTokenScopes,
  generateAgentToken,
} from "@/lib/auth/api-token";
import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { apiTokenCreateSchema } from "@/lib/validation";

export async function GET() {
  const user = await requireSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scopes: apiTokens.scopes,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, user.id), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));

  return Response.json(tokens);
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = apiTokenCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const generated = generateAgentToken();
  const requestedScopes = parsed.data.scopes ?? [...agentDefaultScopes];
  if (
    requestedScopes.some(
      (scope) => !agentTokenScopes.includes(scope as (typeof agentTokenScopes)[number]),
    )
  ) {
    return Response.json({ error: "Unknown API token scope" }, { status: 400 });
  }
  const expiresInDays =
    parsed.data.expiresInDays === undefined ? 90 : parsed.data.expiresInDays;
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000)
    : null;
  const [token] = await db
    .insert(apiTokens)
    .values({
      userId: user.id,
      name: parsed.data.name,
      tokenHash: generated.hash,
      prefix: generated.prefix,
      scopes: requestedScopes,
      expiresAt,
    })
    .returning({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scopes: apiTokens.scopes,
      expiresAt: apiTokens.expiresAt,
    });

  return Response.json({ ...token, token: generated.raw }, { status: 201 });
}
