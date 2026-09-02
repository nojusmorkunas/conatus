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

describe("dev mode", () => {
  afterEach(() => {
    delete process.env.CONATUS_DEV_MODE;
    clearRateLimits();
  });

  test("stops counting once enabled, and resumes when it is off", () => {
    process.env.CONATUS_DEV_MODE = "1";
    for (let attempt = 0; attempt < 50; attempt++) {
      expect(checkRateLimit("dev:key", { limit: 3, windowMs: 1000 }).ok).toBe(true);
    }
    // Nothing was recorded, so turning it off must not leave a spent budget.
    expect(getRateLimitEntryCount()).toBe(0);

    delete process.env.CONATUS_DEV_MODE;
    expect(checkRateLimit("dev:key", { limit: 1, windowMs: 1000 }).ok).toBe(true);
    expect(checkRateLimit("dev:key", { limit: 1, windowMs: 1000 }).ok).toBe(false);
  });
});
