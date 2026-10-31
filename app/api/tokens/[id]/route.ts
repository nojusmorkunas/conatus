import { and, eq, isNull } from "drizzle-orm";

import { unreachableProjectIds } from "@/app/api/tokens/project-access";
import { tokenSelect } from "@/app/api/tokens/route";
import { invalid, notFound, unauthorized } from "@/lib/api/responses";
import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { apiTokens, pushSubscriptions } from "@/lib/db/schema";
import { agentTokenScopes } from "@/lib/token-access";
import { apiTokenUpdateSchema } from "@/lib/validation";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const [deleted] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id)))
    .returning({ id: apiTokens.id });

  if (!deleted) return notFound();
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.tokenId, deleted.id));

  return Response.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSessionUser();
  if (!user) return unauthorized();

  const parsed = apiTokenUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return invalid(parsed.error);

  const { id } = await params;
  const condition = and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id), isNull(apiTokens.revokedAt));
  const [token] = await db.select(tokenSelect).from(apiTokens).where(condition);
  if (!token) return notFound();

  const changes: Partial<typeof apiTokens.$inferInsert> = {};
  if (parsed.data.name !== undefined) changes.name = parsed.data.name;
  if (parsed.data.scopes !== undefined) {
    changes.scopes = agentTokenScopes.filter((scope) => parsed.data.scopes!.includes(scope));
  }
  if (parsed.data.projectIds !== undefined) {
    const projectIds = parsed.data.projectIds === null ? null : [...new Set(parsed.data.projectIds)];
    const addedIds = projectIds?.filter((projectId) => !token.projectIds?.includes(projectId)) ?? [];
    if (addedIds.length && (await unreachableProjectIds(user.id, addedIds)).length) {
      return Response.json({ error: "One of the selected projects doesn't exist or isn't shared with you" }, { status: 400 });
    }
    changes.projectIds = projectIds;
  }
  if (parsed.data.expiresAt !== undefined) {
    changes.expiresAt = parsed.data.expiresAt === null ? null : new Date(parsed.data.expiresAt);
  }

  const [updated] = await db.update(apiTokens).set(changes).where(condition).returning(tokenSelect);
  if (!updated) return notFound();
  return Response.json(updated);
}
