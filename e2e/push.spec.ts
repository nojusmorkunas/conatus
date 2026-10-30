import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test } from "@playwright/test";

import { registerAndLogin } from "./helpers";

// Needs the server to run with PUSH_ALLOW_PRIVATE_NETWORKS=1, since the push
// endpoint here listens on loopback.
test("a change wakes the user's other devices but not the one that made it", async ({ page, request }) => {
  const received: string[] = [];
  const endpoint = createServer((incoming, response) => {
    let body = "";
    incoming.on("data", (chunk) => (body += chunk));
    incoming.on("end", () => {
      received.push(`${incoming.url} ${body}`);
      response.writeHead(201).end();
    });
  });
  await new Promise<void>((resolve) => endpoint.listen(0, "127.0.0.1", resolve));
  const pushBase = `http://127.0.0.1:${(endpoint.address() as AddressInfo).port}`;

  try {
    await registerAndLogin(page, `e2e-${Date.now()}-push`);
    const inboxHref = await page.getByRole("link", { name: "Inbox" }).getAttribute("href");
    const projectId = inboxHref?.split("/").at(-1);

    async function device(name: string) {
      const response = await page.request.post("/api/tokens", {
        data: { name, scopes: ["tasks:read", "tasks:write"] },
      });
      expect(response.status()).toBe(201);
      const headers = { Authorization: `Bearer ${(await response.json()).token}` };
      const registered = await request.put("/api/v1/push/subscription", {
        headers,
        data: { url: `${pushBase}/${name}` },
      });
      expect(registered.status()).toBe(204);
      return headers;
    }
    const phone = await device("phone");
    const tablet = await device("tablet");

    const created = await request.post("/api/v1/tasks", {
      headers: tablet,
      data: { projectId, content: "Written on the tablet" },
    });
    expect(created.status()).toBe(201);
    await expect.poll(() => received, { timeout: 15_000 }).toContain('/phone {"t":"sync"}');
    expect(received.filter((entry) => entry.startsWith("/tablet"))).toEqual([]);

    // Signing out takes the address with the token.
    expect((await request.delete("/api/v1/auth/device-token", { headers: phone })).status()).toBe(204);
    const sent = received.length;
    await request.post("/api/v1/tasks", {
      headers: tablet,
      data: { projectId, content: "Nobody listening" },
    });
    await page.waitForTimeout(8_000);
    expect(received.length).toBe(sent);
  } finally {
    endpoint.close();
  }
});
