import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  enrollUser,
  normalizeUsername,
  RegistrationEnrollmentError,
} from "@/lib/auth/registration";
import { hashPassword } from "@/lib/auth/password";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { registrationRequestSchema } from "@/lib/validation";

const REGISTER_IP_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
const REGISTER_USERNAME_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

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

  const { username, password, timezone, inviteToken } = parsed.data;
  const normalizedUsername = normalizeUsername(username);
  const usernameLimit = checkRateLimit(
    `register:username:${normalizedUsername}`,
    REGISTER_USERNAME_LIMIT,
  );
  if (!usernameLimit.ok) return rateLimited(usernameLimit.retryAfter);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, normalizedUsername));
  if (existing) {
    return Response.json({ error: "Username already registered" }, { status: 409 });
  }

  try {
    await enrollUser({
      username: normalizedUsername,
      passwordHash: await hashPassword(password),
      timezone,
      inviteToken,
    });
  } catch (error) {
    if (error instanceof RegistrationEnrollmentError) {
      const message =
        error.code === "username_mismatch"
          ? "This invitation was issued for a different username."
          : error.code === "invalid_invite"
            ? "This signup link is invalid, expired, or has already been used."
            : "Registration requires an invitation from the server administrator.";
      return Response.json({ error: message }, { status: 403 });
    }
    throw error;
  }

  return Response.json({ ok: true, username: normalizedUsername }, { status: 201 });
}
