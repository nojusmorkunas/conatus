import { POST as createComment } from "@/app/api/comments/route";
import { withIdempotency } from "@/lib/api/idempotency";
import { unauthorized } from "@/lib/api/responses";
import { requireApiActor } from "@/lib/auth/session";

export { GET } from "@/app/api/comments/route";

export async function POST(request: Request) {
  const actor = await requireApiActor("comments:write");
  if (!actor) return unauthorized();
  return withIdempotency(
    request,
    { userId: actor.id, tokenId: actor.tokenId, operation: "comments.create" },
    () => createComment(request),
  );
}
