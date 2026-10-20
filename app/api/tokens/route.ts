import { and, desc, eq, isNull } from "drizzle-orm";

import { unreachableProjectIds } from "@/app/api/tokens/project-access";
import { invalid, unauthorized } from "@/lib/api/responses";
import { generateAgentToken } from "@/lib/auth/api-token";
import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { agentDefaultScopes, agentTokenScopes } from "@/lib/token-access";
import { apiTokenCreateSchema } from "@/lib/validation";

export const tokenSelect = {
  id: apiTokens.id,
  name: apiTokens.name,
  prefix: apiTokens.prefix,
  scopes: apiTokens.scopes,
  projectIds: apiTokens.projectIds,
  expiresAt: apiTokens.expiresAt,
  createdAt: apiTokens.createdAt,
  lastUsedAt: apiTokens.lastUsedAt,
};

export async function GET() {
  const user = await requireSessionUser();
  if (!user) return unauthorized();

  const tokens = await db
    .select(tokenSelect)
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, user.id), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));

  return Response.json(tokens);
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user) return unauthorized();

  const parsed = apiTokenCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return invalid(parsed.error);
  }

  const projectIds = parsed.data.projectIds ? [...new Set(parsed.data.projectIds)] : null;
  if (projectIds && (await unreachableProjectIds(user.id, projectIds)).length) {
    return Response.json({ error: "One of the selected projects doesn't exist or isn't shared with you" }, { status: 400 });
  }

  const generated = generateAgentToken();
  const requestedScopes = parsed.data.scopes ?? agentDefaultScopes;
  const scopes = agentTokenScopes.filter((scope) => requestedScopes.includes(scope));
  const expiresAt = parsed.data.expiresAt === undefined
    ? new Date(Date.now() + 90 * 86_400_000)
    : parsed.data.expiresAt === null ? null : new Date(parsed.data.expiresAt);
  const [token] = await db
    .insert(apiTokens)
    .values({
      userId: user.id,
      name: parsed.data.name,
      tokenHash: generated.hash,
      prefix: generated.prefix,
      scopes,
      projectIds,
      expiresAt,
    })
    .returning(tokenSelect);

  return Response.json({ ...token, token: generated.raw }, { status: 201 });
}
