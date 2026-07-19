import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { getRequestOrigin } from "@/lib/auth/origin";
import {
  createRegistrationInvite,
  isInstanceAdmin,
  normalizeUsername,
} from "@/lib/auth/registration";
import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { registrationInvites } from "@/lib/db/schema";
import { registrationInviteCreateSchema } from "@/lib/validation";

async function requireAdmin() {
  const user = await requireSessionUser();
  return user && (await isInstanceAdmin(user.id)) ? user : null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const invitations = await db
    .select({
      id: registrationInvites.id,
      username: registrationInvites.username,
      expiresAt: registrationInvites.expiresAt,
      createdAt: registrationInvites.createdAt,
    })
    .from(registrationInvites)
    .where(
      and(
        isNull(registrationInvites.usedAt),
        isNull(registrationInvites.revokedAt),
        gt(registrationInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(registrationInvites.createdAt));

  return Response.json(invitations);
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const parsed = registrationInviteCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid username." }, { status: 400 });
  }

  const username = parsed.data.username
    ? normalizeUsername(parsed.data.username)
    : null;
  if (username) {
    const [existing] = await db
      .select({ id: registrationInvites.id })
      .from(registrationInvites)
      .where(
        and(
          eq(registrationInvites.username, username),
          isNull(registrationInvites.usedAt),
          isNull(registrationInvites.revokedAt),
          gt(registrationInvites.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (existing) {
      return Response.json(
        { error: "That username already has an active signup link." },
        { status: 409 },
      );
    }
  }

  const { invite, rawToken } = await createRegistrationInvite({
    createdByUserId: admin.id,
    username,
  });
  const origin = getRequestOrigin(request);
  if (!origin) {
    return Response.json(
      { error: "The server's public URL is not configured." },
      { status: 500 },
    );
  }

  return Response.json(
    {
      ...invite,
      url: `${origin}/register?invite=${encodeURIComponent(rawToken)}`,
    },
    { status: 201 },
  );
}
