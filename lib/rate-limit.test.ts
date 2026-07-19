import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  checkRateLimit,
  clearRateLimits,
  getRateLimitEntryCount,
} from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    clearRateLimits();
  });

  afterEach(() => {
    clearRateLimits();
    vi.useRealTimers();
  });

  test("allows up to the limit and blocks the next request", () => {
    const options = { limit: 2, windowMs: 60_000 };

    expect(checkRateLimit("login:a", options)).toMatchObject({ ok: true, remaining: 1 });
    expect(checkRateLimit("login:a", options)).toMatchObject({ ok: true, remaining: 0 });
    expect(checkRateLimit("login:a", options)).toEqual({
      ok: false,
      remaining: 0,
      retryAfter: 60,
    });
  });

  test("reports whole retry seconds and resets after the window", () => {
    const options = { limit: 1, windowMs: 60_000 };
    checkRateLimit("reset:a", options);
    vi.advanceTimersByTime(10_500);

    expect(checkRateLimit("reset:a", options).retryAfter).toBe(50);
    vi.advanceTimersByTime(49_500);
    expect(checkRateLimit("reset:a", options).ok).toBe(true);
  });

  test("keeps distinct keys independent", () => {
    const options = { limit: 1, windowMs: 60_000 };
    checkRateLimit("login:a", options);

    expect(checkRateLimit("login:a", options).ok).toBe(false);
    expect(checkRateLimit("login:b", options).ok).toBe(true);
  });

  test("prunes expired entries on access", () => {
    checkRateLimit("expired", { limit: 1, windowMs: 1_000 });
    vi.advanceTimersByTime(1_000);
    checkRateLimit("current", { limit: 1, windowMs: 60_000 });

    expect(getRateLimitEntryCount()).toBe(1);
  });
});
