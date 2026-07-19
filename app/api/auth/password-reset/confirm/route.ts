import { and, eq, isNull, ne } from "drizzle-orm";

import { hashToken } from "@/lib/auth/api-token";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { resetPasswordSchema } from "@/lib/validation";

const invalidLinkError = "This reset link is invalid or has expired.";
const tokenAlreadyUsed = Symbol("tokenAlreadyUsed");

export async function POST(request: Request) {
  const parsed = resetPasswordSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const [resetToken] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashToken(parsed.data.token)))
    .limit(1);

  if (
    !resetToken ||
    resetToken.usedAt ||
    resetToken.expiresAt < new Date()
  ) {
    return Response.json({ error: invalidLinkError }, { status: 400 });
  }

  const now = new Date();
  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.id, resetToken.id),
            isNull(passwordResetTokens.usedAt),
          ),
        )
        .returning({ id: passwordResetTokens.id });
      if (!claimed) {
        throw tokenAlreadyUsed;
      }
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: now })
        .where(eq(users.id, resetToken.userId));
      await tx
        .delete(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, resetToken.userId),
            ne(passwordResetTokens.id, resetToken.id),
          ),
        );
    });
  } catch (error) {
    if (error === tokenAlreadyUsed) {
      return Response.json({ error: invalidLinkError }, { status: 400 });
    }
    throw error;
  }

  return Response.json({ ok: true });
}
