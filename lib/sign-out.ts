import { signOut } from "next-auth/react";

import type { Outbox } from "@/lib/offline/outbox";
import type { SyncRepository } from "@/lib/offline/sync";
import { pendingChanges, type OfflineStore } from "@/lib/offline/store";

// The offline provider lives in React and signing out is called from plain click handlers in
// three places, so the provider registers what it opened here and this reads it back. There is
// one provider per page, so one slot is enough.
type OfflineSession = { userId: string; store: OfflineStore & { close?(): void }; outbox: Outbox; repo: SyncRepository; stop(): void };
let session: OfflineSession | null = null;

export function registerOfflineSession(next: OfflineSession | null) {
  session = next;
}

const SYNC_CAP_MS = 5000;

// Resolves to whether the user may go on. One last sync gets what it can out first.
async function sendOrConfirm({ store, repo }: OfflineSession): Promise<boolean> {
  const queued = () => pendingChanges(store.getSnapshot()).length;
  if (queued() && navigator.onLine) await Promise.race([repo.sync(), new Promise((resolve) => setTimeout(resolve, SYNC_CAP_MS))]);
  const left = queued();
  if (!left) return true;
  return window.confirm(`${left === 1 ? "1 change hasn't" : `${left} changes haven't`} been sent and will be lost. Sign out anyway?`);
}

const deleteDatabase = (name: string) =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    // Blocked by another tab: it closes when it hears the sign-out, so don't wait for it here.
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });

// Cached pages and the local copy hold this account's tasks; they must not outlive the session.
// [force] skips the question about unsent changes, for an account that no longer exists.
export async function signOutAndClearCache({ force = false } = {}) {
  const current = session;
  if (current) {
    if (!force && !(await sendOrConfirm(current))) return;
    session = null;
    current.stop();
    try {
      await current.store.flush();
      current.store.close?.();
      await deleteDatabase(`conatus-${current.userId}`);
    } catch {
      // Best effort, like the caches.
    }
  }
  try {
    if ("caches" in window) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
  } catch {
    // Best effort: signing out must still happen if clearing fails.
  }
  await signOut({ callbackUrl: "/login" });
}
