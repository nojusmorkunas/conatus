import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL("../dist/stdio.js", import.meta.url).pathname],
  env: {
    PATH: process.env.PATH ?? "",
    TASKS_BASE_URL: process.env.TASKS_BASE_URL ?? "",
    TASKS_API_TOKEN: process.env.TASKS_API_TOKEN ?? "",
  },
});
const client = new Client({ name: "conatus-mcp-smoke", version: "1.0.0" });

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
      tools: tools.tools.length,
      today: structured?.result?.today,
      ok: !context.isError,
    }),
  );
} finally {
  await client.close();
}
