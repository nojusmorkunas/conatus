#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TaskApiClient } from "./api-client.js";
import { loadConfig } from "./config.js";
import { createTaskManagerServer } from "./server.js";

export async function runStdio() {
  const config = loadConfig();
  const api = new TaskApiClient({
    baseUrl: config.baseUrl,
    token: config.apiToken,
    timeoutMs: config.requestTimeoutMs,
  });
  const server = createTaskManagerServer(api);
  const transport = new StdioServerTransport();

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
}
