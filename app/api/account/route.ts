import { and, count, eq, ne, sql } from "drizzle-orm";

import { invalid, unauthorized } from "@/lib/api/responses";
import { normalizeUsername, REGISTRATION_LOCK_ID } from "@/lib/auth/registration";
import { requireSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { notifyDevices } from "@/lib/push";
import { accountDeleteSchema, registerSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  const sessionUser = await requireSessionUser();
  if (!sessionUser) return unauthorized();

  const parsed = registerSchema
    .pick({ username: true })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);

  const { username } = parsed.data;
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ne(users.id, sessionUser.id)))
    .limit(1);
  if (taken) {
    return Response.json({ error: "That username is already taken." }, { status: 409 });
  }

  await db
    .update(users)
    .set({ username, updatedAt: new Date() })
    .where(eq(users.id, sessionUser.id));

  notifyDevices(sessionUser);

  return Response.json({ ok: true, username });
}

export async function DELETE(request: Request) {
  const sessionUser = await requireSessionUser();
  if (!sessionUser) return unauthorized();

  const parsed = accountDeleteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Username does not match" }, { status: 400 });
  }

  // Keep the instance-admin invariant intact. The sole remaining account may
  // delete itself, which intentionally reopens first-user bootstrap.
  const deleted = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${REGISTRATION_LOCK_ID})`);
    const [[account], [totals]] = await Promise.all([
      tx
        .select({ role: users.instanceRole })
        .from(users)
        .where(eq(users.id, sessionUser.id))
        .limit(1),
      tx.select({ count: count() }).from(users),
    ]);
    if (account?.role === "admin" && totals.count > 1) return [];

    // Owned projects cascade, intentionally removing access for collaborators.
    return tx
      .delete(users)
      .where(
        and(
          eq(users.id, sessionUser.id),
          eq(users.username, normalizeUsername(parsed.data.username)),
        ),
      )
      .returning({ id: users.id });
  });

  if (deleted.length === 0) {
    return Response.json(
      {
        error:
          "Username does not match, or another administrator must be appointed before deleting this account.",
      },
      { status: 400 },
    );
  }

  return Response.json({ ok: true });
}
