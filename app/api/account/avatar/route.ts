import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { BUCKET, ensureBucket, s3 } from "@/lib/storage";

const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return Response.json({ error: "An image file is required" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_SIZE) {
    return Response.json({ error: "Image must be 5MB or smaller" }, { status: 400 });
  }

  await ensureBucket();
  const key = `avatars/${user.id}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await s3.putObject(BUCKET, key, buffer, file.size, {
    "Content-Type": file.type,
  });
  await db
    .update(users)
    .set({ image: key, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return Response.json({ ok: true });
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [account] = await db
    .select({ image: users.image })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!account?.image) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await ensureBucket();
  const [object, stat] = await Promise.all([
    s3.getObject(BUCKET, account.image),
    s3.statObject(BUCKET, account.image),
  ]);
  const chunks: Buffer[] = [];
  for await (const chunk of object) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return new Response(Buffer.concat(chunks), {
    headers: {
      "Content-Type": stat.metaData["content-type"] ?? "image/*",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
