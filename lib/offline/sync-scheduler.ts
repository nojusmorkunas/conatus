// Decides when to sync. Callers only say that something changed; the scheduler waits a moment so
// a burst of writes goes out as one sync, never runs two at once, and backs off after a failure.

const BACKOFF_MS = [30_000, 60_000, 300_000];

export type SyncScheduler = {
  /** Asks for a sync soon. Many calls in a row make one sync. */
  request(): void;
  /** The network came back: forget the backoff and sync. */
  reset(): void;
  /** Syncs now and then, while [isVisible]. */
  start(): void;
  stop(): void;
};

export function createSyncScheduler(
  /** Resolves to something truthy when the sync failed, like SyncRepository.sync's problem. */
  sync: () => Promise<unknown>,
  options: { debounceMs?: number; pollMs?: number; isOnline?: () => boolean; isVisible?: () => boolean } = {},
): SyncScheduler {
  const { debounceMs = 800, pollMs = 60_000, isOnline = () => navigator.onLine, isVisible = () => document.visibilityState === "visible" } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let again = false;
  let failures = 0;
  let blockedUntil = 0;
  let stopped = false;

  const request = () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    if (timer) return;
    timer = setTimeout(run, Math.max(debounceMs, blockedUntil - Date.now()));
  };

  async function run() {
    timer = null;
    if (!isOnline()) return; // the online event asks again
    running = true;
    let failed: boolean;
    try {
      failed = !!(await sync());
    } catch {
      failed = true;
    }
    running = false;
    if (failed) blockedUntil = Date.now() + BACKOFF_MS[Math.min(failures++, BACKOFF_MS.length - 1)];
    else failures = blockedUntil = 0;
    if (again) {
      again = false;
      request();
    }
  }

  return {
    request,
    reset() {
      failures = blockedUntil = 0;
      request();
    },
    start() {
      stopped = false;
      poll ??= setInterval(() => isVisible() && request(), pollMs);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      timer = poll = null;
    },
  };
}
