import { createHash } from "node:crypto";

import { and, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { idempotencyKeys } from "@/lib/db/schema";

const MAX_KEY_LENGTH = 200;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export async function withIdempotency(
  request: Request,
  options: { userId: string; operation: string },
  handler: () => Promise<Response>,
) {
  const key = request.headers.get("idempotency-key");
  if (key === null) return handler();
  if (!key.trim() || key.length > MAX_KEY_LENGTH) {
    return Response.json(
      { error: "Idempotency-Key must contain 1 to 200 characters" },
      { status: 400 },
    );
  }

  const requestHash = createHash("sha256")
    .update(await request.clone().text())
    .digest("hex");
  const expiresAt = new Date(Date.now() + RETENTION_MS);

  await db
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, options.userId),
        eq(idempotencyKeys.operation, options.operation),
        eq(idempotencyKeys.key, key),
        lt(idempotencyKeys.expiresAt, new Date()),
      ),
    );

  const [reservation] = await db
    .insert(idempotencyKeys)
    .values({
      userId: options.userId,
      operation: options.operation,
      key,
      requestHash,
      expiresAt,
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });

  if (!reservation) {
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.userId, options.userId),
          eq(idempotencyKeys.operation, options.operation),
          eq(idempotencyKeys.key, key),
        ),
      )
      .limit(1);

    if (!existing || existing.expiresAt <= new Date()) {
      return Response.json(
        { error: "The idempotency reservation expired; use a new key" },
        { status: 409 },
      );
    }
    if (existing.requestHash !== requestHash) {
      return Response.json(
        { error: "This Idempotency-Key was already used with a different request" },
        { status: 409 },
      );
    }
    if (existing.statusCode === null) {
      return Response.json(
        { error: "A request with this Idempotency-Key is still in progress" },
        { status: 409, headers: { "Retry-After": "1" } },
      );
    }
    return Response.json(existing.responseBody, { status: existing.statusCode });
  }

  const response = await handler();
  const responseBody = await response.clone().json().catch(() => ({ ok: response.ok }));
  await db
    .update(idempotencyKeys)
    .set({ statusCode: response.status, responseBody })
    .where(eq(idempotencyKeys.id, reservation.id));
  return response;
}
