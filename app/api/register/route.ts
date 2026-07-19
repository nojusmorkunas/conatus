import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { hashToken } from "@/lib/auth/api-token";
import { getRequestOrigin } from "@/lib/auth/origin";
import { db } from "@/lib/db";
import { emailVerificationTokens, users } from "@/lib/db/schema";
import {
  enrollUser,
  normalizeEmail,
  RegistrationEnrollmentError,
} from "@/lib/auth/registration";
import { hashPassword } from "@/lib/auth/password";
import { transporter } from "@/lib/mailer";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { registrationRequestSchema } from "@/lib/validation";

const REGISTER_IP_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
const REGISTER_EMAIL_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

function rateLimited(retryAfter: number) {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: Request) {
  const ipLimit = checkRateLimit(
    `register:ip:${getClientIp(request)}`,
    REGISTER_IP_LIMIT,
  );
  if (!ipLimit.ok) return rateLimited(ipLimit.retryAfter);

  const parsed = registrationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { email, password, timezone, inviteToken } = parsed.data;
  const normalizedEmail = normalizeEmail(email);
  const emailLimit = checkRateLimit(
    `register:email:${normalizedEmail}`,
    REGISTER_EMAIL_LIMIT,
  );
  if (!emailLimit.ok) return rateLimited(emailLimit.retryAfter);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail));
  if (existing) {
    return Response.json({ error: "Email already registered" }, { status: 409 });
  }

  let user: { id: string; email: string };
  try {
    user = await enrollUser({
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      timezone,
      inviteToken,
    });
  } catch (error) {
    if (error instanceof RegistrationEnrollmentError) {
      const message =
        error.code === "email_mismatch"
          ? "This invitation was issued for a different email address."
          : error.code === "invalid_invite"
            ? "This signup link is invalid, expired, or has already been used."
            : "Registration requires an invitation from the server administrator.";
      return Response.json({ error: message }, { status: 403 });
    }
    throw error;
  }

  const raw = randomBytes(32).toString("base64url");
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

  return Response.json({ ok: true }, { status: 201 });
}
