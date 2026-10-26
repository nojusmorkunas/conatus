import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";

import { hashToken } from "@/lib/auth/api-token";
import { db } from "@/lib/db";
import { deviceLoginCodes } from "@/lib/db/schema";

export function challengeMatches(verifier: string, challenge: string) {
  const actual = Buffer.from(
    createHash("sha256").update(verifier).digest("base64url"),
  );
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createDeviceLoginCode({
  userId,
  codeChallenge,
  deviceName,
}: {
  userId: string;
  codeChallenge: string;
  deviceName: string;
}) {
  const now = new Date();
  await db.delete(deviceLoginCodes).where(lte(deviceLoginCodes.expiresAt, now));

  const raw = randomBytes(32).toString("base64url");
  await db.insert(deviceLoginCodes).values({
    userId,
    codeHash: hashToken(raw),
    codeChallenge,
    deviceName,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
  });
  return raw;
}

export async function redeemDeviceLoginCode(code: string, codeVerifier: string) {
  const [row] = await db
    .delete(deviceLoginCodes)
    .where(
      and(
        eq(deviceLoginCodes.codeHash, hashToken(code)),
        gt(deviceLoginCodes.expiresAt, new Date()),
      ),
    )
    .returning();

  if (!row || !challengeMatches(codeVerifier, row.codeChallenge)) return null;
  return { userId: row.userId, deviceName: row.deviceName };
}
