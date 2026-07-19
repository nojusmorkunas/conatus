import { generateKeyBetween } from "fractional-indexing";

import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";

export type CreateUserInput = {
  email: string;
  passwordHash: string | null;
  timezone?: string;
  emailVerified?: Date | null;
  instanceRole?: "admin" | "member";
};

type UserCreationClient = Pick<typeof db, "insert">;

export async function createUserWithInboxUsing(
  client: UserCreationClient,
  {
    email,
    passwordHash,
    timezone = "UTC",
    emailVerified = null,
    instanceRole = "member",
  }: CreateUserInput,
) {
  const [user] = await client
    .insert(users)
    .values({ email, passwordHash, timezone, emailVerified, instanceRole })
    .returning({ id: users.id, email: users.email, instanceRole: users.instanceRole });

  await client.insert(projects).values({
    userId: user.id,
    name: "Inbox",
    isInbox: true,
    order: generateKeyBetween(null, null),
  });

  return user;
}

export async function createUserWithInbox({
  email,
  passwordHash,
  timezone = "UTC",
  emailVerified = null,
  instanceRole = "member",
}: CreateUserInput) {
  return db.transaction((tx) =>
    createUserWithInboxUsing(tx, {
      email,
      passwordHash,
      timezone,
      emailVerified,
      instanceRole,
    }),
  );
}
