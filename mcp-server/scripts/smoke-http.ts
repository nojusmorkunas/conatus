import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL ?? "http://127.0.0.1:3001/mcp");
const bearerToken = process.env.MCP_BEARER_TOKEN;
if (!bearerToken) throw new Error("MCP_BEARER_TOKEN is required");

const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${bearerToken}` } },
});
const client = new Client({
  name: "conatus-mcp-http-smoke",
  version: "1.0.0",
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const context = await client.callTool({
    name: "get_workspace_context",
    arguments: {},
  });
  const structured = context.structuredContent as
    | { result?: { today?: string } }
    | undefined;
  console.log(
    JSON.stringify({
      transport: "streamable-http",
      tools: tools.tools.length,
      today: structured?.result?.today,
      ok: !context.isError,
    }),
  );
} finally {
  await client.close();
}
