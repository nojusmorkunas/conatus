import { POST as createProject } from "@/app/api/projects/route";
import { withIdempotency } from "@/lib/api/idempotency";
import { unauthorized } from "@/lib/api/responses";
import { requireApiActor } from "@/lib/auth/session";

export { GET } from "@/app/api/projects/route";

export async function POST(request: Request) {
  const actor = await requireApiActor("projects:write");
  if (!actor) return unauthorized();
  return withIdempotency(
    request,
    { userId: actor.id, tokenId: actor.tokenId, operation: "projects.create" },
    () => createProject(request),
  );
}
