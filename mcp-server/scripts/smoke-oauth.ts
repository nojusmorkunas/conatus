import { createHash, randomBytes } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const mcpUrl = new URL(process.env.MCP_URL ?? "http://127.0.0.1:3001/mcp");
const approvalPassword = process.env.MCP_OAUTH_PASSWORD;
if (!approvalPassword) throw new Error("MCP_OAUTH_PASSWORD is required");

const origin = new URL(mcpUrl.origin);
const protectedMetadataUrl = new URL(`/.well-known/oauth-protected-resource${mcpUrl.pathname}`, origin);
const protectedMetadata = await fetch(protectedMetadataUrl).then((response) => response.json()) as {
  resource: string;
  authorization_servers: string[];
};
const issuer = new URL(protectedMetadata.authorization_servers[0]);
const authorizationMetadata = await fetch(new URL("/.well-known/oauth-authorization-server", issuer))
  .then((response) => response.json()) as {
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint: string;
  };

const client = await fetch(authorizationMetadata.registration_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_name: "OAuth smoke test",
    redirect_uris: ["http://127.0.0.1/oauth/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  }),
}).then(async (response) => {
  if (!response.ok) throw new Error(`Registration failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<{ client_id: string }>;
});

const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const state = randomBytes(16).toString("base64url");
const authorizeUrl = new URL(authorizationMetadata.authorization_endpoint);
authorizeUrl.search = new URLSearchParams({
  client_id: client.client_id,
  redirect_uri: "http://127.0.0.1/oauth/callback",
  response_type: "code",
  code_challenge: challenge,
  code_challenge_method: "S256",
  scope: "mcp",
  resource: protectedMetadata.resource,
  state,
}).toString();
const approvalResponse = await fetch(authorizeUrl, { redirect: "manual" });
const approvalUrl = approvalResponse.headers.get("location");
if (!approvalUrl) throw new Error("Authorization endpoint did not redirect to approval");
const requestId = new URL(approvalUrl).searchParams.get("request");
if (!requestId) throw new Error("Approval request ID is missing");
const approvalPage = await fetch(approvalUrl);
if (!approvalPage.ok || !(await approvalPage.text()).includes("Allow task access?")) {
  throw new Error("Approval page was not rendered");
}
const callbackResponse = await fetch(new URL("/oauth/approve", origin), {
  method: "POST",
  redirect: "manual",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ request: requestId, password: approvalPassword, decision: "allow" }),
});
const callbackUrlValue = callbackResponse.headers.get("location");
if (!callbackUrlValue) throw new Error(`Approval failed: ${callbackResponse.status}`);
const callbackUrl = new URL(callbackUrlValue);
if (callbackUrl.searchParams.get("state") !== state) throw new Error("OAuth state mismatch");
const code = callbackUrl.searchParams.get("code");
if (!code) throw new Error(`Authorization failed: ${callbackUrl.searchParams.get("error")}`);

const tokens = await fetch(authorizationMetadata.token_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: client.client_id,
    code,
    code_verifier: verifier,
    redirect_uri: "http://127.0.0.1/oauth/callback",
    resource: protectedMetadata.resource,
  }),
}).then(async (response) => {
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<{ access_token: string; refresh_token: string }>;
});

const transport = new StreamableHTTPClientTransport(mcpUrl, {
  requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
});
const mcp = new Client({ name: "conatus-mcp-oauth-smoke", version: "1.0.0" });
try {
  await mcp.connect(transport);
  const tools = await mcp.listTools();
  const context = await mcp.callTool({ name: "get_workspace_context", arguments: {} });
  const structured = context.structuredContent as { result?: { today?: string } } | undefined;
  console.log(JSON.stringify({
    discovery: true,
    dynamicRegistration: true,
    pkce: true,
    tools: tools.tools.length,
    today: structured?.result?.today,
    ok: !context.isError,
  }));
} finally {
  await mcp.close();
}
