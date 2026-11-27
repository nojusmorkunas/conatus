import { POST as createReminder } from "@/app/api/reminders/route";
import { withIdempotency } from "@/lib/api/idempotency";
import { unauthorized } from "@/lib/api/responses";
import { requireApiActor } from "@/lib/auth/session";

export { GET } from "@/app/api/reminders/route";

export async function POST(request: Request) {
  const actor = await requireApiActor("reminders:write");
  if (!actor) return unauthorized();
  return withIdempotency(
    request,
    { userId: actor.id, tokenId: actor.tokenId, operation: "reminders.create" },
    () => createReminder(request),
  );
}
