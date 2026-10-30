import { eq } from "drizzle-orm";

import { invalid, unauthorized } from "@/lib/api/responses";
import { requireApiActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { pushUrlProblem } from "@/lib/push";
import { pushSubscriptionSchema } from "@/lib/validation";

// The device token is the subscription's identity: each signed-in device has
// one push address, replaced by registering again and dropped with the token.
export async function PUT(request: Request) {
  const actor = await requireApiActor();
  if (!actor?.tokenId) return unauthorized();

  const parsed = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  const problem = pushUrlProblem(parsed.data.url);
  if (problem) return Response.json({ error: { url: [problem] } }, { status: 400 });

  const address = { url: parsed.data.url, updatedAt: new Date() };
  await db
    .insert(pushSubscriptions)
    .values({ tokenId: actor.tokenId, ...address })
    .onConflictDoUpdate({ target: pushSubscriptions.tokenId, set: address });
  return new Response(null, { status: 204 });
}

export async function DELETE() {
  const actor = await requireApiActor();
  if (!actor?.tokenId) return unauthorized();

  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.tokenId, actor.tokenId));
  return new Response(null, { status: 204 });
}
