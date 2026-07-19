import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", db: "up" });
  } catch (err) {
    return Response.json(
      { status: "error", db: "down", message: (err as Error).message },
      { status: 503 },
    );
  }
}
