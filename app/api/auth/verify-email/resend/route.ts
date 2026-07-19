import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { hashToken } from "@/lib/auth/api-token";
import { getRequestOrigin } from "@/lib/auth/origin";
import { normalizeEmail } from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { emailVerificationTokens, users } from "@/lib/db/schema";
import { transporter } from "@/lib/mailer";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resendVerificationSchema } from "@/lib/validation";

const VERIFICATION_RESEND_IP_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };
const VERIFICATION_RESEND_EMAIL_LIMIT = { limit: 3, windowMs: 15 * 60 * 1000 };

function rateLimited(retryAfter: number) {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: Request) {
  const ipLimit = checkRateLimit(
    `verify-email-resend:ip:${getClientIp(request)}`,
    VERIFICATION_RESEND_IP_LIMIT,
  );
  if (!ipLimit.ok) return rateLimited(ipLimit.retryAfter);

  const parsed = resendVerificationSchema.safeParse(
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
    `verify-email-resend:email:${normalizedEmail}`,
    VERIFICATION_RESEND_EMAIL_LIMIT,
  );
  if (!emailLimit.ok) return rateLimited(emailLimit.retryAfter);

  const [user] = await db
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (user && !user.emailVerified) {
    const raw = randomBytes(32).toString("base64url");
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id));
    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    try {
      const origin = getRequestOrigin(request);
      if (!origin) {
        throw new Error("Email verification origin is not configured");
      }
      const link = `${origin}/verify-email?token=${raw}`;
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: normalizedEmail,
        subject: "Verify your email",
        text: `Verify your email using this link:\n\n${link}\n\nThis link expires in 24 hours.`,
        html: `<p>Verify your email using this link:</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
      });
    } catch (error) {
      console.error("email verification send failed", user.id, error);
    }
  }

  return Response.json({ ok: true });
}
