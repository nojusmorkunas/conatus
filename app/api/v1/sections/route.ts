import { POST as createSection } from "@/app/api/sections/route";
import { withIdempotency } from "@/lib/api/idempotency";
import { unauthorized } from "@/lib/api/responses";
import { requireApiActor } from "@/lib/auth/session";

export { GET } from "@/app/api/sections/route";

export async function POST(request: Request) {
  const actor = await requireApiActor("projects:write");
  if (!actor) return unauthorized();
  return withIdempotency(
    request,
    { userId: actor.id, tokenId: actor.tokenId, operation: "sections.create" },
    () => createSection(request),
  );
}
