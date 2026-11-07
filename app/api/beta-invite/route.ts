import { eq, sql } from "drizzle-orm";

import { invalid, notFound, unauthorized } from "@/lib/api/responses";
import { requireSessionUser } from "@/lib/auth/session";
import { currentBetaInvite } from "@/lib/beta-invites";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { betaInviteSeenSchema } from "@/lib/validation";

// The banner calls this as soon as it shows, so the invite never comes back,
// and again with optOut when the admin asks not to hear about betas at all.
// Browser sessions only: an API token has no business answering for the user.
export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user) return unauthorized();

  const parsed = betaInviteSeenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  const { inviteId, optOut } = parsed.data;
  if (inviteId !== currentBetaInvite?.id) return notFound();

  const seen = jsonbArrayWith(inviteId);
  await db
    .update(users)
    .set(optOut ? { seenBetaInvites: seen, betaInvitesOptOut: true } : { seenBetaInvites: seen })
    .where(eq(users.id, user.id));
  return new Response(null, { status: 204 });
}

// Adds the id once, so repeat calls (React runs effects twice in development)
// leave a single entry.
function jsonbArrayWith(id: string) {
  const item = sql`jsonb_build_array(${id}::text)`;
  return sql`case when ${users.seenBetaInvites} @> ${item} then ${users.seenBetaInvites} else ${users.seenBetaInvites} || ${item} end`;
}
