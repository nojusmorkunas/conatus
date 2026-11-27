import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createSyncScheduler } from "./sync-scheduler";

describe("sync scheduler", () => {
  let online = true;
  let visible = true;
  beforeEach(() => {
    vi.useFakeTimers();
    online = visible = true;
  });
  afterEach(() => vi.useRealTimers());

  const make = (sync: () => Promise<unknown>) => createSyncScheduler(sync, { isOnline: () => online, isVisible: () => visible });

  test("a burst of requests makes one sync after the debounce", async () => {
    const sync = vi.fn().mockResolvedValue(null);
    const scheduler = make(sync);
    scheduler.request();
    scheduler.request();
    await vi.advanceTimersByTimeAsync(799);
    scheduler.request();
    expect(sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  test("a request during a sync runs one more after it", async () => {
    let finish!: () => void;
    const sync = vi.fn().mockImplementationOnce(() => new Promise<null>((resolve) => (finish = () => resolve(null)))).mockResolvedValue(null);
    const scheduler = make(sync);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(800);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sync).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(800);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  test("it doesn't sync while offline", async () => {
    const sync = vi.fn().mockResolvedValue(null);
    const scheduler = make(sync);
    online = false;
    scheduler.request();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sync).not.toHaveBeenCalled();
    online = true;
    scheduler.reset();
    await vi.advanceTimersByTimeAsync(800);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  test("failures back off 30 s, 60 s, then 5 min, and reset clears it", async () => {
    const sync = vi.fn().mockResolvedValue({ kind: "offline" });
    const scheduler = make(sync);
    const callsAfter = async (ms: number) => {
      scheduler.request();
      await vi.advanceTimersByTimeAsync(ms);
      return sync.mock.calls.length;
    };
    expect(await callsAfter(800)).toBe(1);
    expect(await callsAfter(29_000)).toBe(1);
    expect(await callsAfter(1_000)).toBe(2);
    expect(await callsAfter(59_000)).toBe(2);
    expect(await callsAfter(1_000)).toBe(3);
    expect(await callsAfter(299_000)).toBe(3);
    expect(await callsAfter(1_000)).toBe(4);
    scheduler.reset();
    await vi.advanceTimersByTimeAsync(800);
    expect(sync).toHaveBeenCalledTimes(5);
  });

  test("it polls every minute while visible only", async () => {
    const sync = vi.fn().mockResolvedValue(null);
    const scheduler = make(sync);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(60_800);
    expect(sync).toHaveBeenCalledTimes(1);
    visible = false;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sync).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  test("stopped, it does nothing", async () => {
    const sync = vi.fn().mockResolvedValue(null);
    const scheduler = make(sync);
    scheduler.request();
    scheduler.stop();
    scheduler.request();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sync).not.toHaveBeenCalled();
  });
});
