import { sql } from "drizzle-orm";

import { hashPassword } from "@/lib/auth/password";
import { createUserWithInboxUsing } from "@/lib/auth/create-user";
import { normalizeUsername, REGISTRATION_LOCK_ID } from "@/lib/auth/registration";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type BootstrapAdminConfig = {
  username: string;
  password: string;
};

type BootstrapEnvironment = {
  [key: string]: string | undefined;
  CONATUS_ADMIN_USERNAME?: string;
  CONATUS_ADMIN_PASSWORD?: string;
};

export function readBootstrapAdminConfig(
  environment: BootstrapEnvironment = process.env,
): BootstrapAdminConfig | null {
  const username = environment.CONATUS_ADMIN_USERNAME?.trim() ?? "";
  const password = environment.CONATUS_ADMIN_PASSWORD ?? "";

  if (!username && !password) return null;
  if (!username || !password) {
    throw new Error(
      "CONATUS_ADMIN_USERNAME and CONATUS_ADMIN_PASSWORD must be set together",
    );
  }

  const normalizedUsername = normalizeUsername(username);
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalizedUsername)) {
    throw new Error(
      "CONATUS_ADMIN_USERNAME must be 3-32 characters using letters, numbers, dots, underscores, or hyphens",
    );
  }
  if (password.length < 8) {
    throw new Error("CONATUS_ADMIN_PASSWORD must be at least 8 characters");
  }

  return { username: normalizedUsername, password };
}

export async function bootstrapAdmin(config: BootstrapAdminConfig) {
  return db.transaction(async (tx) => {
    // Uses the same lock as interactive registration so the two bootstrap
    // paths cannot both observe an empty users table.
    await tx.execute(sql`select pg_advisory_xact_lock(${REGISTRATION_LOCK_ID})`);

    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .limit(1);
    if (existingUser) return { created: false as const };

    const user = await createUserWithInboxUsing(tx, {
      username: config.username,
      passwordHash: await hashPassword(config.password),
      instanceRole: "admin",
    });

    return { created: true as const, user };
  });
}
