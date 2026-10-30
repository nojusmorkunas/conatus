import { lookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

import { and, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import type { Job } from "pg-boss";

import { db } from "@/lib/db";
import { apiTokens, projectCollaborators, projects, pushSubscriptions, tasks } from "@/lib/db/schema";
import { reportError } from "@/lib/error-reporter";
import { boss, PUSH_DELIVERY_QUEUE } from "@/lib/jobs";

// A wake-up, never task data: the device syncs to find out what changed. The
// address is either the Conatus relay for Firebase or a UnifiedPush endpoint,
// and both take any small body.
const WAKE_UP = JSON.stringify({ t: "sync" });

// At most one post per address in this window. The first change in a burst
// goes out at once, the rest share one more post when the window ends.
const COALESCE_SECONDS = 5;

export type PushDelivery = { tokenId: string };

// Push addresses come from users and the server posts to them, so by default
// they can't point into the server's own network. A LAN ntfy server or a test
// receiver on localhost needs the administrator to opt in.
function privateNetworksAllowed() {
  return process.env.PUSH_ALLOW_PRIVATE_NETWORKS === "1";
}

// BlockList also matches IPv4-mapped IPv6 addresses (::ffff:10.0.0.1)
// against the IPv4 ranges.
const privateRanges = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) privateRanges.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) privateRanges.addSubnet(network, prefix, "ipv6");

export function isPrivateAddress(address: string) {
  const family = isIP(address);
  return family === 0 || privateRanges.check(address, family === 4 ? "ipv4" : "ipv6");
}

// Why the server won't post to this address, or null when it will.
export function pushUrlProblem(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Push address must be a URL";
  }
  const allowPrivate = privateNetworksAllowed();
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    return "Push address must use HTTPS";
  }
  if (allowPrivate) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || (isIP(host) && isPrivateAddress(host))) {
    return "Push address must not point to a private network";
  }
  return null;
}

// Checks every address a name resolves to, at connect time, so a name that
// passed validation can't be pointed at the server's network later.
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (!privateNetworksAllowed() && addresses.some(({ address }) => isPrivateAddress(address))) {
      return callback(new Error(`${hostname} resolves to a private address`), "", 0);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

// The status the endpoint answered. Redirects aren't followed: node:http never
// does, and a 3xx counts as a failure like any other non-2xx.
export function postWakeUp(address: string) {
  const problem = pushUrlProblem(address);
  if (problem) return Promise.reject(new Error(problem));

  const url = new URL(address);
  return new Promise<number>((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": WAKE_UP.length },
        lookup: publicOnlyLookup,
        signal: AbortSignal.timeout(5_000),
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    request.on("error", reject);
    request.end(WAKE_UP);
  });
}

async function deliverPush({ data }: Job<PushDelivery>) {
  const [subscription] = await db
    .select({ url: pushSubscriptions.url })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.tokenId, data.tokenId));
  if (!subscription) return;

  const status = await postWakeUp(subscription.url);
  if (status === 404 || status === 410) {
    // The endpoint has forgotten this device. Matching the url too keeps an
    // address the device registered since then.
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.tokenId, data.tokenId),
          eq(pushSubscriptions.url, subscription.url),
        ),
      );
    return;
  }
  if (status < 200 || status >= 300) throw new Error(`Push endpoint responded ${status}`);
}

export async function deliverPushes(jobs: Job<PushDelivery>[]) {
  for (const job of jobs) await deliverPush(job);
}

// Owners and collaborators of these projects, or of the projects these tasks
// are in. Deleted projects count: their members need to see them go.
async function memberIds(projectIds: string[], taskIds: string[]) {
  if (taskIds.length) {
    const rows = await db
      .select({ projectId: tasks.projectId })
      .from(tasks)
      .where(inArray(tasks.id, taskIds));
    projectIds = [...projectIds, ...rows.map((row) => row.projectId)];
  }
  if (!projectIds.length) return [];
  const rows = await db
    .select({ ownerId: projects.userId, collaboratorId: projectCollaborators.userId })
    .from(projects)
    .leftJoin(projectCollaborators, eq(projectCollaborators.projectId, projects.id))
    .where(inArray(projects.id, projectIds));
  return rows.flatMap((row) => (row.collaboratorId ? [row.ownerId, row.collaboratorId] : [row.ownerId]));
}

// Wakes every signed-in device that can see the change, except the one that
// made it, which already knows. With no scope the change is the actor's alone
// (labels, reminders, settings). Runs in the background: a push must never
// slow down or fail the write that caused it.
export function notifyDevices(
  actor: { id: string; tokenId?: string | null },
  scope: { projects?: string[]; tasks?: string[]; users?: string[] } = {},
) {
  void (async () => {
    const userIds = new Set([
      ...(scope.users ?? []),
      ...(await memberIds(scope.projects ?? [], scope.tasks ?? [])),
    ]);
    if (!scope.projects && !scope.tasks && !scope.users) userIds.add(actor.id);
    if (!userIds.size) return;

    const subscriptions = await db
      .select({ tokenId: pushSubscriptions.tokenId })
      .from(pushSubscriptions)
      .innerJoin(apiTokens, eq(apiTokens.id, pushSubscriptions.tokenId))
      .where(
        and(
          inArray(apiTokens.userId, [...userIds]),
          isNull(apiTokens.revokedAt),
          or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, new Date())),
          actor.tokenId ? ne(pushSubscriptions.tokenId, actor.tokenId) : undefined,
        ),
      );
    await Promise.all(
      subscriptions.map(({ tokenId }) =>
        boss.sendDebounced(
          PUSH_DELIVERY_QUEUE,
          { tokenId },
          { retryLimit: 2, retryDelay: 5 },
          COALESCE_SECONDS,
          tokenId,
        ),
      ),
    );
  })().catch((error) => reportError(error, { source: "push" }));
}
