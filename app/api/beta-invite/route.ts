import { eq, sql } from "drizzle-orm";

import { invalid, notFound, unauthorized } from "@/lib/api/responses";
import { requireSessionUser } from "@/lib/auth/session";
import { currentBetaInvite } from "@/lib/beta-invites";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { betaInviteAnswerSchema } from "@/lib/validation";

// The banner calls this when the admin answers it with any of its buttons, so
// the invite never comes back, with optOut when they ask not to hear about
// betas at all. Browser sessions only: an API token has no business answering
// for the user.
export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user) return unauthorized();

  const parsed = betaInviteAnswerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  const { inviteId, optOut } = parsed.data;
  if (inviteId !== currentBetaInvite?.id) return notFound();

  const dismissed = jsonbArrayWith(inviteId);
  await db
    .update(users)
    .set(optOut
      ? { dismissedBetaInvites: dismissed, betaInvitesOptOut: true }
      : { dismissedBetaInvites: dismissed })
    .where(eq(users.id, user.id));
  return new Response(null, { status: 204 });
}

// Adds the id once, so answering again from a second open tab leaves a single
// entry.
function jsonbArrayWith(id: string) {
  const item = sql`jsonb_build_array(${id}::text)`;
  return sql`case when ${users.dismissedBetaInvites} @> ${item} then ${users.dismissedBetaInvites} else ${users.dismissedBetaInvites} || ${item} end`;
}
