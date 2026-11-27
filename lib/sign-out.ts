import { signOut } from "next-auth/react";

// Cached pages hold this account's tasks; they must not outlive the session.
export async function signOutAndClearCache() {
  try {
    if ("caches" in window) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
  } catch {
    // Best effort: signing out must still happen if clearing fails.
  }
  await signOut({ callbackUrl: "/login" });
}
