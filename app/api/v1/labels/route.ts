import { POST as createLabel } from "@/app/api/labels/route";
import { withIdempotency } from "@/lib/api/idempotency";
import { unauthorized } from "@/lib/api/responses";
import { requireApiActor } from "@/lib/auth/session";

export { GET } from "@/app/api/labels/route";

export async function POST(request: Request) {
  const actor = await requireApiActor("labels:write");
  if (!actor) return unauthorized();
  return withIdempotency(
    request,
    { userId: actor.id, tokenId: actor.tokenId, operation: "labels.create" },
    () => createLabel(request),
  );
}
