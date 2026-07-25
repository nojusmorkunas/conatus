import { reportError } from "@/lib/error-reporter";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const MESSAGE_LIMIT = 2_000;
const STACK_LIMIT = 8_000;
const MONITORING_IP_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

function stringValue(value: unknown, limit: number): string | undefined {
  return typeof value === "string" ? value.slice(0, limit) : undefined;
}

function rateLimited(retryAfter: number) {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: Request) {
  const ipLimit = checkRateLimit(
    `monitoring:ip:${getClientIp(request)}`,
    MONITORING_IP_LIMIT,
  );
  if (!ipLimit.ok) return rateLimited(ipLimit.retryAfter);

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
