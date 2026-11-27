"use client";

import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { onServerWrite } from "@/lib/api-client";
import { todayInTimezone } from "@/lib/dates";
import { openOfflineStore } from "@/lib/offline/idb";
import { ListWrites } from "@/lib/offline/list-writes";
import { NoteWrites } from "@/lib/offline/notes";
import { Outbox } from "@/lib/offline/outbox";
import { OfflineStore } from "@/lib/offline/store";
import { SyncRepository } from "@/lib/offline/sync";
import { createSyncScheduler, type SyncScheduler } from "@/lib/offline/sync-scheduler";
import { TaskWrites } from "@/lib/offline/task-writes";
import { warmPages } from "@/lib/offline/warm-pages";
import { registerOfflineSession } from "@/lib/sign-out";

export type OfflineStatus = "loading" | "ready" | "memory";

type Backend = {
  store: OfflineStore & { close?(): void };
  outbox: Outbox;
  repo: SyncRepository;
  writes: { tasks: TaskWrites; lists: ListWrites; notes: NoteWrites };
  scheduler: SyncScheduler;
};

export type Offline = Backend & {
  status: OfflineStatus;
  /** "YYYY-MM-DD" in the user's time zone. */
  today: string;
};

/**
 * What the context holds. It never changes, and readers subscribe to [get], because a new context
 * value would force the page's Suspense boundaries that are still hydrating to render again on
 * the client, throwing away the server's HTML.
 */
export class OfflineHolder {
  private readonly listeners = new Set<() => void>();
  constructor(
    private value: Offline,
    /** What the server renders. */
    readonly initial: Offline = value,
  ) {}

  get = () => this.value;

  set(value: Offline) {
    if (value === this.value) return;
    this.value = value;
    for (const listener of [...this.listeners]) listener();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
}

export const OfflineContext = createContext<OfflineHolder | null>(null);

const OPEN_TIMEOUT_MS = 3000;
// When opening failed, the next loads skip the wait for a day, then try again.
const MARKER = "conatus-no-indexeddb";
const MARKER_TTL_MS = 24 * 60 * 60 * 1000;

const markedUnavailable = () => {
  try {
    return Date.now() - Number(localStorage.getItem(MARKER)) < MARKER_TTL_MS;
  } catch {
    return false;
  }
};

const markUnavailable = () => {
  try {
    localStorage.setItem(MARKER, String(Date.now()));
  } catch {}
};

/** The user's IndexedDB store, or null when it isn't there, throws or takes too long to open. */
async function openOrNull(userId: string): Promise<(OfflineStore & { close(): void }) | null> {
  if (typeof indexedDB === "undefined" || markedUnavailable()) return null;
  const opening = openOfflineStore(userId);
  const timeout = new Promise<null>((resolve) => setTimeout(resolve, OPEN_TIMEOUT_MS, null));
  try {
    const opened = await Promise.race([opening, timeout]);
    if (opened) return opened;
    opening.then((late) => late.close(), () => {});
  } catch {}
  markUnavailable();
  return null;
}

/**
 * Opens the user's local store, keeps it in sync and hands out the writes. Until the store has
 * opened, everything here is an empty memory store, which is also what stays if IndexedDB can't be used.
 */
export function OfflineProvider({ userId, timeZone, dateFormat, children }: { userId: string; timeZone: string; dateFormat: string; children: ReactNode }) {
  const [today, setToday] = useState(() => todayInTimezone(timeZone));
  const [opened, setOpened] = useState<{ store: OfflineStore & { close?(): void }; status: OfflineStatus }>(() => ({ store: new OfflineStore(), status: "loading" }));

  const router = useRouter();
  const backend = useMemo<Backend>(() => {
    const { store } = opened;
    const outbox = new Outbox(store);
    // A 401 sends the browser to login with the queue left in the database.
    const repo = new SyncRepository(userId, store, outbox, undefined, () => router.replace("/login"));
    const scheduler = createSyncScheduler(() => repo.sync());
    const requestSync = scheduler.request;
    const todayNow = () => todayInTimezone(timeZone);
    const writes = { tasks: new TaskWrites(store, requestSync, todayNow, () => dateFormat, () => timeZone), lists: new ListWrites(store, requestSync), notes: new NoteWrites(store, requestSync) };
    return { store, outbox, repo, writes, scheduler };
  }, [opened, userId, timeZone, dateFormat, router]);

  useEffect(() => {
    let cancelled = false;
    openOrNull(userId).then((store) => {
      if (!cancelled) setOpened(store ? { store, status: "ready" } : (current) => ({ store: current.store, status: "memory" }));
      else store?.close();
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { status } = opened;
  useEffect(() => {
    if (status === "loading") return;
    const sync = backend.scheduler;
    const stop = sync.stop;
    registerOfflineSession({ userId, store: backend.store, outbox: backend.outbox, repo: backend.repo, stop });
    onServerWrite(sync.request);
    const onOnline = () => sync.reset();
    const onVisible = () => document.visibilityState === "visible" && sync.request();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    sync.start();
    sync.request();
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      onServerWrite(null);
      registerOfflineSession(null);
      stop();
    };
  }, [status, backend, userId]);

  useEffect(() => () => opened.store.close?.(), [opened.store]);

  // Once the first sync has filled the local copy, cache the screens a visit hasn't reached yet.
  useEffect(() => {
    if (status === "loading") return;
    const { store } = backend;
    const warm = () => {
      const snapshot = store.getSnapshot();
      if (snapshot.meta.lastSyncAt === null) return false;
      const inbox = [...snapshot.projects.values()].find((project) => project.isInbox && !project.shared);
      void warmPages(inbox?.id ?? null);
      return true;
    };
    if (warm()) return;
    const stop = store.subscribe(() => warm() && stop());
    return stop;
  }, [status, backend]);

  // Without IndexedDB, leaving the page loses what hasn't been sent.
  useEffect(() => {
    if (status !== "memory") return;
    const guard = (event: BeforeUnloadEvent) => {
      if (backend.store.getSnapshot().changes.size) event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [status, backend]);

  useEffect(() => {
    const check = () => setToday(todayInTimezone(timeZone));
    const timer = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [timeZone]);

  const value = useMemo<Offline>(() => ({ ...backend, status, today }), [backend, status, today]);
  const [holder] = useState(() => new OfflineHolder(value));
  useEffect(() => holder.set(value), [holder, value]);
  return <OfflineContext value={holder}>{children}</OfflineContext>;
}
