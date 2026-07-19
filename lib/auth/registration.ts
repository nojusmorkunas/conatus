import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { hashToken } from "@/lib/auth/api-token";
import {
  createUserWithInboxUsing,
  type CreateUserInput,
} from "@/lib/auth/create-user";
import { db } from "@/lib/db";
import { registrationInvites, users } from "@/lib/db/schema";

// Serializes enrollment decisions so two requests cannot both observe an
// empty users table and become bootstrap administrators.
export const REGISTRATION_LOCK_ID = 724_193_811;
export const REGISTRATION_INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type RegistrationState =
  | { kind: "bootstrap" }
  | { kind: "open" }
  | { kind: "invited"; username: string | null }
  | { kind: "closed"; reason: "invite_required" | "invalid_invite" };

export class RegistrationEnrollmentError extends Error {
  constructor(
    public readonly code:
      | "invite_required"
      | "invalid_invite"
      | "username_mismatch",
  ) {
    super(code);
  }
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isOpenRegistrationEnabled() {
  return process.env.REGISTRATION_MODE?.trim().toLowerCase() === "open";
}

async function activeInvite(rawToken: string) {
  const [invite] = await db
    .select({ username: registrationInvites.username })
    .from(registrationInvites)
    .where(
      and(
        eq(registrationInvites.tokenHash, hashToken(rawToken)),
        isNull(registrationInvites.usedAt),
        isNull(registrationInvites.revokedAt),
        gt(registrationInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return invite ?? null;
}

export async function getRegistrationState(
  rawToken?: string,
): Promise<RegistrationState> {
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .limit(1);
  if (!existingUser) return { kind: "bootstrap" };
  if (isOpenRegistrationEnabled()) return { kind: "open" };
  if (!rawToken) return { kind: "closed", reason: "invite_required" };

  const invite = await activeInvite(rawToken);
  return invite
    ? { kind: "invited", username: invite.username }
    : { kind: "closed", reason: "invalid_invite" };
}

export async function enrollUser(
  input: CreateUserInput & { inviteToken?: string },
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${REGISTRATION_LOCK_ID})`);

    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .limit(1);
    const isBootstrap = !existingUser;
    let inviteId: string | null = null;

    if (!isBootstrap && !isOpenRegistrationEnabled()) {
      if (!input.inviteToken) {
        throw new RegistrationEnrollmentError("invite_required");
      }
      const [invite] = await tx
        .select({
          id: registrationInvites.id,
          username: registrationInvites.username,
          expiresAt: registrationInvites.expiresAt,
          usedAt: registrationInvites.usedAt,
          revokedAt: registrationInvites.revokedAt,
        })
        .from(registrationInvites)
        .where(eq(registrationInvites.tokenHash, hashToken(input.inviteToken)))
        .limit(1);
      if (
        !invite ||
        invite.usedAt ||
        invite.revokedAt ||
        invite.expiresAt <= new Date()
      ) {
        throw new RegistrationEnrollmentError("invalid_invite");
      }
      if (
        invite.username &&
        invite.username !== normalizeUsername(input.username)
      ) {
        throw new RegistrationEnrollmentError("username_mismatch");
      }
      inviteId = invite.id;
    }

    const user = await createUserWithInboxUsing(tx, {
      ...input,
      username: normalizeUsername(input.username),
      instanceRole: isBootstrap ? "admin" : "member",
    });

    if (inviteId) {
      await tx
        .update(registrationInvites)
        .set({ usedAt: new Date(), usedByUserId: user.id })
        .where(eq(registrationInvites.id, inviteId));
    }

    return { ...user, isBootstrap };
  });
}

export async function createRegistrationInvite({
  createdByUserId,
  username,
}: {
  createdByUserId: string;
  username?: string | null;
}) {
  const rawToken = randomBytes(32).toString("base64url");
  const normalizedUsername = username ? normalizeUsername(username) : null;
  const [invite] = await db
    .insert(registrationInvites)
    .values({
      tokenHash: hashToken(rawToken),
      username: normalizedUsername,
      createdByUserId,
      expiresAt: new Date(Date.now() + REGISTRATION_INVITE_LIFETIME_MS),
    })
    .returning({
      id: registrationInvites.id,
      username: registrationInvites.username,
      expiresAt: registrationInvites.expiresAt,
      createdAt: registrationInvites.createdAt,
    });

  return { invite, rawToken };
}

export async function isInstanceAdmin(userId: string) {
  const [user] = await db
    .select({ role: users.instanceRole })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.role === "admin";
}
