import { reportError } from "@/lib/error-reporter";

const MESSAGE_LIMIT = 2_000;
const STACK_LIMIT = 8_000;

function stringValue(value: unknown, limit: number): string | undefined {
  return typeof value === "string" ? value.slice(0, limit) : undefined;
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  const contentLength = Number(request.headers.get("content-length"));

  if (!Number.isFinite(contentLength) || contentLength <= STACK_LIMIT + MESSAGE_LIMIT) {
    try {
      const value: unknown = await request.json();
      if (value && typeof value === "object" && !Array.isArray(value)) {
        body = value as Record<string, unknown>;
      }
    } catch {
      // Treat malformed payloads as empty reports; this endpoint is a sink only.
    }
  }

  const message = stringValue(body.message, MESSAGE_LIMIT) ?? "Client error";
  reportError(new Error(message), {
    source: "client",
    stack: stringValue(body.stack, STACK_LIMIT),
    digest: stringValue(body.digest, MESSAGE_LIMIT),
    path: stringValue(body.path, MESSAGE_LIMIT),
  });

  return Response.json({ ok: true });
}
