import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Request, Response } from "express";
import { afterEach, describe, expect, test } from "vitest";

import { TaskMcpOAuthProvider } from "./oauth-provider.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function responseRecorder() {
  const record: { location?: string; status?: number; body?: string } = {};
  const response = {
    redirect(status: number, location: string) { record.status = status; record.location = location; return this; },
    status(status: number) { record.status = status; return this; },
    send(body: string) { record.body = body; return this; },
    set() { return this; },
  } as unknown as Response;
  return { record, response };
}

describe("TaskMcpOAuthProvider", () => {
  test("persists a PKCE grant, rotates refresh tokens and stores only token hashes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "task-mcp-oauth-"));
    temporaryDirectories.push(directory);
    const storePath = join(directory, "oauth.json");
    const provider = new TaskMcpOAuthProvider({
      publicUrl: new URL("https://mcp.example.com/mcp"),
      password: "correct horse battery staple",
      storePath,
    });
    const client = await provider.clientsStore.registerClient!({
      client_id: "agent-client",
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
      client_name: "Test agent",
    } as OAuthClientInformationFull);

    const authorization = responseRecorder();
    await provider.authorize(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: client.redirect_uris[0],
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["mcp"],
      state: "original-state",
    }, authorization.response);
    const requestId = new URL(authorization.record.location!).searchParams.get("request")!;

    const approval = responseRecorder();
    await provider.completeApproval({ body: {
      request: requestId,
      password: "correct horse battery staple",
      decision: "allow",
    } } as Request, approval.response);
    const callback = new URL(approval.record.location!);
    const code = callback.searchParams.get("code")!;
    expect(callback.searchParams.get("state")).toBe("original-state");
    expect(await provider.challengeForAuthorizationCode(client, code)).toBe("pkce-challenge");

    const tokens = await provider.exchangeAuthorizationCode(
      client,
      code,
      undefined,
      client.redirect_uris[0],
      new URL("https://mcp.example.com/mcp"),
    );
    const auth = await provider.verifyAccessToken(tokens.access_token);
    expect(auth).toMatchObject({ clientId: "agent-client", scopes: ["mcp"] });
    expect(auth.resource?.href).toBe("https://mcp.example.com/mcp");

    const refreshed = await provider.exchangeRefreshToken(client, tokens.refresh_token!, ["mcp"]);
    await expect(provider.exchangeRefreshToken(client, tokens.refresh_token!)).rejects.toThrow("Invalid refresh token");
    await provider.revokeToken(client, { token: refreshed.access_token });
    await expect(provider.verifyAccessToken(refreshed.access_token)).rejects.toThrow("Invalid or expired");

    const persisted = await readFile(storePath, "utf8");
    expect(persisted).not.toContain(code);
    expect(persisted).not.toContain(tokens.access_token);
    expect(persisted).not.toContain(tokens.refresh_token!);
    expect(persisted).not.toContain("correct horse battery staple");
  });
});
