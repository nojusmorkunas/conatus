import { eq } from "drizzle-orm";

import { hashToken } from "@/lib/auth/api-token";
import { db } from "@/lib/db";
import { acceptProjectInvitations } from "@/lib/db/invitations";
import { emailVerificationTokens, users } from "@/lib/db/schema";

const invalidLinkError = "This verification link is invalid or has expired.";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.token !== "string" || !body.token) {
    return Response.json({ error: invalidLinkError }, { status: 400 });
  }

  const [verificationToken] = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, hashToken(body.token)))
    .limit(1);

  if (!verificationToken || verificationToken.expiresAt < new Date()) {
    return Response.json({ error: invalidLinkError }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    const [verifiedUser] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, verificationToken.userId))
      .limit(1);
    if (!verifiedUser) return;

    await tx
      .update(users)
      .set({ emailVerified: new Date(), updatedAt: new Date() })
      .where(eq(users.id, verificationToken.userId));
    await acceptProjectInvitations(tx, {
      userId: verificationToken.userId,
      email: verifiedUser.email,
    });
    await tx
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, verificationToken.userId));
  });

  return Response.json({ ok: true });
}
