import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { Job } from "pg-boss";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

const { lookup, deleted, stored } = vi.hoisted(() => ({
  lookup: vi.fn(),
  deleted: [] as unknown[],
  stored: { url: "" },
}));

vi.mock("node:dns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:dns")>()),
  lookup,
}));
vi.mock("@/lib/jobs", () => ({ boss: {}, PUSH_DELIVERY_QUEUE: "push-deliver" }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => (stored.url ? [{ url: stored.url }] : []) }) }),
    delete: () => ({ where: async (condition: unknown) => { deleted.push(condition); } }),
  },
}));

import {
  deliverPushes,
  isPrivateAddress,
  postWakeUp,
  type PushDelivery,
  pushUrlProblem,
} from "./push";

const job = { data: { tokenId: "token" } } as Job<PushDelivery>;

let server: Server;
let base = "";
const received: { path: string; body: string }[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      received.push({ path: request.url ?? "", body });
      const status = Number(request.url?.slice(1)) || 200;
      response.writeHead(status, status === 302 ? { Location: "/200" } : {}).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

afterEach(() => {
  vi.unstubAllEnvs();
  lookup.mockReset();
  received.length = 0;
  deleted.length = 0;
  stored.url = "";
});

describe("isPrivateAddress", () => {
  test.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1",
  ])("refuses %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  test.each(["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe("pushUrlProblem", () => {
  test("takes a public HTTPS address", () => {
    expect(pushUrlProblem("https://relay.example.com/abc")).toBeNull();
  });

  test.each([
    "not a url", "http://relay.example.com/abc", "ftp://relay.example.com/abc",
    "https://localhost/abc", "https://app.localhost/abc", "https://127.0.0.1/abc",
    "https://[::1]/abc", "https://169.254.169.254/latest", "https://10.0.0.8/abc",
  ])("refuses %s", (address) => {
    expect(pushUrlProblem(address)).not.toBeNull();
  });

  test("an administrator can allow private networks and plain HTTP", () => {
    vi.stubEnv("PUSH_ALLOW_PRIVATE_NETWORKS", "1");
    expect(pushUrlProblem("http://192.168.1.5/up")).toBeNull();
    expect(pushUrlProblem("ftp://192.168.1.5/up")).not.toBeNull();
  });
});

describe("postWakeUp", () => {
  test("refuses a name that resolves to a private address at connect time", async () => {
    lookup.mockImplementation((_host, _options, callback) =>
      callback(null, [{ address: "10.0.0.5", family: 4 }]));
    await expect(postWakeUp("https://rebound.example.com/abc")).rejects.toThrow(/private address/);
  });

  test("posts only the wake-up body and does not follow redirects", async () => {
    vi.stubEnv("PUSH_ALLOW_PRIVATE_NETWORKS", "1");
    lookup.mockImplementation((_host, _options, callback) =>
      callback(null, [{ address: "127.0.0.1", family: 4 }]));
    const port = new URL(base).port;
    expect(await postWakeUp(`http://push.example.test:${port}/302`)).toBe(302);
    expect(received).toEqual([{ path: "/302", body: '{"t":"sync"}' }]);
  });
});

describe("deliverPushes", () => {
  test("forgets an address the endpoint says is gone", async () => {
    vi.stubEnv("PUSH_ALLOW_PRIVATE_NETWORKS", "1");
    for (const status of [404, 410]) {
      stored.url = `${base}/${status}`;
      await deliverPushes([job]);
    }
    expect(deleted).toHaveLength(2);
  });

  test("keeps the address and fails the job on other errors", async () => {
    vi.stubEnv("PUSH_ALLOW_PRIVATE_NETWORKS", "1");
    stored.url = `${base}/503`;
    await expect(deliverPushes([job])).rejects.toThrow("503");
    expect(deleted).toHaveLength(0);
  });

  test("does nothing once the device has no address", async () => {
    await deliverPushes([job]);
    expect(received).toHaveLength(0);
  });
});
