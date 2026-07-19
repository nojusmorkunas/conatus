#!/usr/bin/env node

import { timingSafeEqual } from "node:crypto";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import express from "express";

import { TaskApiClient } from "./api-client.js";
import { loadConfig } from "./config.js";
import { TaskMcpOAuthProvider } from "./oauth-provider.js";
import { createTaskManagerServer } from "./server.js";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);

function sameSecret(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

async function main() {
  const config = loadConfig();
  if (!loopbackHosts.has(config.http.host) && !config.http.bearerToken && !config.http.publicUrl) {
    throw new Error("MCP OAuth or MCP_BEARER_TOKEN is required when MCP_HOST is not loopback");
  }
  const allowedOrigins = config.http.allowedOrigins.length
    ? config.http.allowedOrigins
    : [config.baseUrl.origin];
  const app = createMcpExpressApp({ host: config.http.host });

  let oauthMiddleware: ReturnType<typeof requireBearerAuth> | null = null;
  if (config.http.publicUrl && config.http.oauthPassword) {
    const provider = new TaskMcpOAuthProvider({
      publicUrl: config.http.publicUrl,
      password: config.http.oauthPassword,
      storePath: config.http.oauthStorePath,
    });
    const issuerUrl = new URL(config.http.publicUrl.origin);
    app.get("/oauth/approve", (req, res) => provider.renderApproval(req, res));
    app.post("/oauth/approve", express.urlencoded({ extended: false }), (req, res) => provider.completeApproval(req, res));
    app.use(mcpAuthRouter({
      provider,
      issuerUrl,
      baseUrl: issuerUrl,
      resourceServerUrl: config.http.publicUrl,
      scopesSupported: ["mcp"],
      resourceName: "Task Manager MCP",
    }));
    oauthMiddleware = requireBearerAuth({
      verifier: provider,
      requiredScopes: ["mcp"],
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(config.http.publicUrl),
    });
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "conatus-mcp", transport: "streamable-http" });
  });

  app.use("/mcp", (req, res, next) => {
    const origin = req.get("Origin");
    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: "Origin is not allowed" });
      return;
    }
    if (!oauthMiddleware && config.http.bearerToken) {
      const match = req.get("Authorization")?.match(/^Bearer (.+)$/);
      if (!match || !sameSecret(match[1], config.http.bearerToken)) {
        res.set("WWW-Authenticate", "Bearer");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }
    next();
  });

  if (oauthMiddleware) app.use("/mcp", oauthMiddleware);

  app.post("/mcp", async (req, res) => {
    const api = new TaskApiClient({
      baseUrl: config.baseUrl,
      token: config.apiToken,
      timeoutMs: config.requestTimeoutMs,
    });
    const server = createTaskManagerServer(api);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    } finally {
      await transport.close();
      await server.close();
    }
  });

  const methodNotAllowed = (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  const httpServer = app.listen(config.http.port, config.http.host, () => {
    const endpoint = config.http.publicUrl?.href ?? `http://${config.http.host}:${config.http.port}/mcp`;
    console.error(`Conatus MCP listening on ${endpoint}`);
  });
  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
