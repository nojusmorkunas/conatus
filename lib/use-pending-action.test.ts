import { describe, expect, it, vi } from "vitest";

import { PendingActionController } from "./use-pending-action";

describe("PendingActionController", () => {
  it("executes after five seconds", () => {
    vi.useFakeTimers();
    const execute = vi.fn();
    const controller = new PendingActionController(vi.fn());

    controller.schedule("Completed task", execute, vi.fn());
    vi.advanceTimersByTime(4_999);
    expect(execute).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(execute).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("undo cancels the action and reverts its optimistic state", () => {
    vi.useFakeTimers();
    const execute = vi.fn();
    const revert = vi.fn();
    const controller = new PendingActionController(vi.fn());

    controller.schedule("Deleted task", execute, revert);
    controller.undo();
    vi.advanceTimersByTime(5_000);

    expect(execute).not.toHaveBeenCalled();
    expect(revert).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("flushes the previous action before scheduling the next", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const controller = new PendingActionController(vi.fn());

    controller.schedule("Completed first", first, vi.fn());
    controller.schedule("Completed second", second, vi.fn());

    expect(first).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5_000);
    expect(second).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
