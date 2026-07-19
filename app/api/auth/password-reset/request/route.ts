import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { hashToken } from "@/lib/auth/api-token";
import { getRequestOrigin } from "@/lib/auth/origin";
import { normalizeEmail } from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { transporter } from "@/lib/mailer";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requestPasswordResetSchema } from "@/lib/validation";

const PASSWORD_RESET_IP_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };
const PASSWORD_RESET_EMAIL_LIMIT = { limit: 3, windowMs: 15 * 60 * 1000 };

function rateLimited(retryAfter: number) {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: Request) {
  const ipLimit = checkRateLimit(
    `password-reset:ip:${getClientIp(request)}`,
    PASSWORD_RESET_IP_LIMIT,
  );
  if (!ipLimit.ok) return rateLimited(ipLimit.retryAfter);

  const parsed = requestPasswordResetSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);
  const emailLimit = checkRateLimit(
    `password-reset:email:${normalizedEmail}`,
    PASSWORD_RESET_EMAIL_LIMIT,
  );
  if (!emailLimit.ok) return rateLimited(emailLimit.retryAfter);

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (user?.passwordHash) {
    const raw = randomBytes(32).toString("base64url");
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    try {
      const origin = getRequestOrigin(request);
      if (!origin) {
        throw new Error("Password reset origin is not configured");
      }
      const link = `${origin}/reset-password?token=${raw}`;
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: normalizedEmail,
        subject: "Reset your password",
        text: `Reset your password using this link:\n\n${link}\n\nThis link expires in one hour.`,
        html: `<p>Reset your password using this link:</p><p><a href="${link}">Reset password</a></p><p>This link expires in one hour.</p>`,
      });
    } catch (error) {
      console.error("password reset email send failed", user.id, error);
    }
  }

  return Response.json({ ok: true });
}
