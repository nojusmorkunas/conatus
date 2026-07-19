type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfter: number;
};

const MAX_ENTRIES = 10_000;

const globalForRateLimit = globalThis as unknown as {
  rateLimitEntries?: Map<string, RateLimitEntry>;
};

const entries = globalForRateLimit.rateLimitEntries ?? new Map<string, RateLimitEntry>();
globalForRateLimit.rateLimitEntries = entries;

function prune(now: number) {
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) entries.delete(key);
  }

  while (entries.size >= MAX_ENTRIES) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey === undefined) break;
    entries.delete(oldestKey);
  }
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  prune(now);

  const current = entries.get(key);
  if (!current) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return {
      ok: true,
      remaining: Math.max(0, limit - 1),
      retryAfter: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  if (current.count >= limit) {
    return { ok: false, remaining: 0, retryAfter };
  }

  current.count += 1;
  return {
    ok: true,
    remaining: Math.max(0, limit - current.count),
    retryAfter,
  };
}

export function getClientIp(request: Request): string {
  // Trust the reverse proxy in front of the app to sanitize these headers.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function clearRateLimits() {
  entries.clear();
}

export function getRateLimitEntryCount() {
  return entries.size;
}
