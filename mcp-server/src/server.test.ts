import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, test } from "vitest";

import { TaskApiClient } from "./api-client.js";
import { createTaskManagerServer } from "./server.js";

const open: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((item) => item.close()));
});

async function connectedClient() {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url: url.toString(), init });
    if (url.pathname.endsWith("/context")) {
      return Response.json({
        apiVersion: "v1",
        serverTime: "2026-07-18T10:00:00.000Z",
        today: "2026-07-18",
        user: { id: "user-1", name: "Test", email: "test@example.test", timezone: "Europe/Amsterdam", dateFormat: "yyyy-MM-dd", weekStart: 1 },
        inbox: { id: "inbox-1", name: "Inbox", isInbox: true },
        grantedScopes: ["tasks:read"],
      });
    }
    if (url.pathname.endsWith("/tasks") && init?.method === "POST") {
      const input = JSON.parse(String(init.body));
      return Response.json({
        id: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        content: input.content,
        projectId: input.projectId,
        priority: input.priority ?? 4,
      }, { status: 201 });
    }
    return Response.json({ error: "Unexpected request" }, { status: 500 });
  };
  const api = new TaskApiClient({
    baseUrl: new URL("https://tasks.example.test"),
    token: `tdm_${"c".repeat(32)}`,
    timeoutMs: 1000,
    fetch: fetchMock,
  });
  const server = createTaskManagerServer(api);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  open.push(client, server);
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, requests };
}

describe("MCP server", () => {
  test("advertises the agent-safe tool surface", async () => {
    const { client } = await connectedClient();
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);

    expect(names).toContain("create_task");
    expect(names).toContain("quick_add_task");
    expect(names).toContain("complete_task");
    expect(names).not.toContain("delete_task");
  });

  test("returns structured workspace context", async () => {
    const { client } = await connectedClient();
    const result = await client.callTool({ name: "get_workspace_context", arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({ result: expect.objectContaining({ today: "2026-07-18" }) }),
    );
  });

  test("validates and executes a mutating tool through the API boundary", async () => {
    const { client, requests } = await connectedClient();
    const result = await client.callTool({
      name: "create_task",
      arguments: {
        projectId: "22222222-2222-4222-8222-222222222222",
        content: "Ship the beta",
        priority: 1,
        idempotencyKey: "mcp-test-request",
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(expect.objectContaining({
      result: expect.objectContaining({ content: "Ship the beta", priority: 1 }),
    }));
    const request = requests.find(({ url }) => url.endsWith("/api/v1/tasks"));
    expect(new Headers(request?.init?.headers).get("Idempotency-Key")).toBe("mcp-test-request");
  });

  test("returns a structured tool error when the task API rejects a call", async () => {
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "get_project",
      arguments: { projectId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      expect.objectContaining({ type: "text", text: expect.stringContaining("Unexpected request") }),
    ]);
  });
});
