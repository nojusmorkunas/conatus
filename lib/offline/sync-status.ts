/** Changes that went out since the connection came back: what was queued then, less what is still queued. */
export const changesSynced = (queuedAtReconnect: number, queuedNow: number) => Math.max(0, queuedAtReconnect - queuedNow);

/** The green pill's words once the first sync after reconnecting has finished. */
export function backOnlineText(synced: number): string {
  if (synced === 0) return "You're back online";
  return `Back online · ${synced} ${synced === 1 ? "change" : "changes"} synced`;
}

/** What the decisions pill says: conflicts, failed changes, or both. */
export function decisionsText(conflicts: number, failed: number): string {
  if (!failed) return conflicts === 1 ? "1 task was changed on another device too" : `${conflicts} tasks were changed on another device too`;
  if (!conflicts) return failed === 1 ? "1 change couldn't sync" : `${failed} changes couldn't sync`;
  return `${conflicts + failed} changes need a decision`;
}
