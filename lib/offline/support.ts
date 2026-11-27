import { generateKeyBetween } from "fractional-indexing";

import { keyAfterSibling } from "@/lib/task-rules";

import { newIdempotencyKey } from "./outbox";
import type { JsonObject } from "./merge";
import type { Tx } from "./store";
import { LOCAL_ID_PREFIX, type ChangeKind, type Target } from "./types";

export const newLocalId = () => LOCAL_ID_PREFIX + newIdempotencyKey();

/** Queues a change to what [id] is of [target]. A create carries a key, so a retry after a lost answer can't make a second copy. */
export function queueChange(tx: Tx, target: Target, id: string, kind: ChangeKind, body: JsonObject, summary: string, base: JsonObject | null = null): number {
  return tx.changes.add({
    id,
    target,
    kind,
    body: JSON.stringify(body),
    summary,
    base: base && JSON.stringify(base),
    idempotencyKey: kind === "Create" ? newIdempotencyKey() : null,
  });
}

const isKey = (key: string) => {
  try {
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
};

export const byOrder = (a: { order: string }, b: { order: string }) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0);

/**
 * The key for a place between two neighbours as they are here. A neighbour with no valid key (the
 * Inbox made here has none) counts as the start or the end instead of failing.
 */
export function keyBetween(lower: string | null, upper: string | null): string {
  const a = lower !== null && isKey(lower) ? lower : null;
  const b = upper !== null && isKey(upper) ? upper : null;
  try {
    return generateKeyBetween(a, b);
  } catch {
    return generateKeyBetween(a, null);
  }
}

/** The key after the last of [keys]. */
export const keyAfter = (keys: string[]): string => keyBetween(keys.filter(isKey).reduce<string | null>((last, key) => (last === null || key > last ? key : last), null), null);

/** The key that puts something after [afterId] among [siblings] (first when null), as the server does; the end when [afterId] isn't one of them. */
export function placeKey(siblings: { id: string; order: string }[], afterId: string | null): string {
  const sorted = [...siblings].sort(byOrder);
  try {
    return keyAfterSibling(sorted, afterId) ?? keyAfter(sorted.map((sibling) => sibling.order));
  } catch {
    return keyAfter(sorted.map((sibling) => sibling.order));
  }
}
