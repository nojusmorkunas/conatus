import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  InvalidGrantError,
  InvalidClientMetadataError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Request, Response } from "express";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
const PENDING_REQUEST_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const SUPPORTED_SCOPES = new Set(["mcp"]);

type PendingRequest = {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  resource: string;
  scopes: string[];
  state?: string;
  expiresAt: number;
  failedAttempts?: number;
};

type AuthorizationCode = PendingRequest & { createdAt: number };

type TokenRecord = {
  clientId: string;
  resource: string;
  scopes: string[];
  expiresAt: number;
};

type StoreState = {
  version: 1;
  clients: Record<string, OAuthClientInformationFull>;
  pending: Record<string, PendingRequest>;
  codes: Record<string, AuthorizationCode>;
  accessTokens: Record<string, TokenRecord>;
  refreshTokens: Record<string, TokenRecord>;
};

function emptyState(): StoreState {
  return { version: 1, clients: {}, pending: {}, codes: {}, accessTokens: {}, refreshTokens: {} };
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function secret() {
  return randomBytes(32).toString("base64url");
}

function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function sameSecret(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

class JsonOAuthStore {
  private state: StoreState | null = null;
  private queue: Promise<void> = Promise.resolve();
  readonly path: string;

  constructor(path: string) {
    this.path = resolve(path);
  }

  private async load() {
    if (this.state) return;
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as StoreState;
      if (parsed.version !== 1) throw new Error("Unsupported OAuth store version");
      this.state = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.state = emptyState();
    }
  }

  private prune(state: StoreState) {
    const now = epochSeconds();
    for (const collection of [state.pending, state.codes, state.accessTokens, state.refreshTokens]) {
      for (const [key, value] of Object.entries(collection)) {
        if (value.expiresAt <= now) delete collection[key];
      }
    }
  }

  private async persist() {
    if (!this.state) return;
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.path}.${process.pid}.${secret()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.path);
    await chmod(this.path, 0o600);
  }

  async access<T>(callback: (state: StoreState) => Promise<T> | T, write = false): Promise<T> {
    let release = () => {};
    const previous = this.queue;
    this.queue = new Promise<void>((resolveQueue) => { release = resolveQueue; });
    await previous;
    try {
      await this.load();
      const state = this.state!;
      this.prune(state);
      const result = await callback(state);
      if (write) await this.persist();
      return result;
    } finally {
      release();
    }
  }
}

export class TaskMcpOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  private readonly store: JsonOAuthStore;
  private readonly resource: URL;
  private readonly approvalUrl: URL;
  private readonly password: string;

  constructor(options: { publicUrl: URL; password: string; storePath: string }) {
    this.resource = new URL(options.publicUrl);
    this.approvalUrl = new URL("/oauth/approve", options.publicUrl);
    this.password = options.password;
    this.store = new JsonOAuthStore(options.storePath);
    this.clientsStore = {
      getClient: async (clientId) => this.store.access((state) => state.clients[clientId]),
      registerClient: async (client) => {
        const fullClient = client as OAuthClientInformationFull;
        if (!fullClient.client_id) throw new Error("OAuth client_id was not generated");
        for (const redirectUri of fullClient.redirect_uris) {
          const url = new URL(redirectUri);
          if (url.hash || url.username || url.password) {
            throw new InvalidClientMetadataError("OAuth redirect URIs cannot contain fragments or user information");
          }
          const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
          if (url.protocol === "http:" && !loopback) {
            throw new InvalidClientMetadataError("HTTP OAuth redirect URIs must use a loopback host");
          }
          if (["javascript:", "data:", "file:"].includes(url.protocol)) {
            throw new InvalidClientMetadataError("Unsafe OAuth redirect URI scheme");
          }
        }
        await this.store.access((state) => { state.clients[fullClient.client_id] = fullClient; }, true);
        return fullClient;
      },
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    const scopes = params.scopes?.length ? [...new Set(params.scopes)] : ["mcp"];
    if (scopes.some((scope) => !SUPPORTED_SCOPES.has(scope))) {
      throw new InvalidScopeError("Only the mcp scope is supported");
    }
    const requestedResource = params.resource ?? this.resource;
    if (requestedResource.href !== this.resource.href) {
      throw new InvalidTargetError("The requested resource is not this MCP server");
    }
    const requestId = secret();
    await this.store.access((state) => {
      state.pending[digest(requestId)] = {
        clientId: client.client_id,
        codeChallenge: params.codeChallenge,
        redirectUri: params.redirectUri,
        resource: this.resource.href,
        scopes,
        state: params.state,
        expiresAt: epochSeconds() + PENDING_REQUEST_TTL_SECONDS,
      };
    }, true);
    const target = new URL(this.approvalUrl);
    target.searchParams.set("request", requestId);
    res.redirect(302, target.href);
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string) {
    const record = await this.store.access((state) => state.codes[digest(authorizationCode)]);
    if (!record || record.clientId !== client.client_id) throw new InvalidGrantError("Invalid authorization code");
    return record.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    return this.store.access((state) => {
      const key = digest(authorizationCode);
      const record = state.codes[key];
      if (!record || record.clientId !== client.client_id) throw new InvalidGrantError("Invalid authorization code");
      delete state.codes[key];
      if (redirectUri && redirectUri !== record.redirectUri) throw new InvalidGrantError("redirect_uri does not match");
      if (resource && resource.href !== record.resource) throw new InvalidTargetError("resource does not match");
      return this.issueTokens(state, record);
    }, true);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    return this.store.access((state) => {
      const key = digest(refreshToken);
      const record = state.refreshTokens[key];
      if (!record || record.clientId !== client.client_id) throw new InvalidGrantError("Invalid refresh token");
      if (resource && resource.href !== record.resource) throw new InvalidTargetError("resource does not match");
      const nextScopes = scopes?.length ? [...new Set(scopes)] : record.scopes;
      if (nextScopes.some((scope) => !record.scopes.includes(scope))) {
        throw new InvalidScopeError("Refresh scope exceeds the original grant");
      }
      delete state.refreshTokens[key];
      return this.issueTokens(state, { ...record, scopes: nextScopes });
    }, true);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = await this.store.access((state) => state.accessTokens[digest(token)]);
    if (!record) throw new InvalidTokenError("Invalid or expired access token");
    return {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      resource: new URL(record.resource),
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    await this.store.access((state) => {
      const key = digest(request.token);
      if (state.accessTokens[key]?.clientId === client.client_id) delete state.accessTokens[key];
      if (state.refreshTokens[key]?.clientId === client.client_id) delete state.refreshTokens[key];
    }, true);
  }

  async renderApproval(req: Request, res: Response) {
    const requestId = typeof req.query.request === "string" ? req.query.request : "";
    const pending = requestId
      ? await this.store.access((state) => state.pending[digest(requestId)])
      : undefined;
    if (!pending) {
      res.status(400).send(this.page("Authorization request expired", "Return to your AI client and connect again."));
      return;
    }
    const client = await this.clientsStore.getClient(pending.clientId);
    const clientName = client?.client_name || "an AI agent";
    res.set("Cache-Control", "no-store");
    res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    res.send(this.page("Allow task access?", `
      <p><strong>${escapeHtml(clientName)}</strong> wants to manage tasks through this MCP server.</p>
      <p class="muted">It will receive an OAuth token for <code>${escapeHtml(this.resource.origin)}</code>. Your task API token stays on this server.</p>
      <form method="post" action="${escapeHtml(this.approvalUrl.pathname)}">
        <input type="hidden" name="request" value="${escapeHtml(requestId)}">
        <label>Server approval password<input name="password" type="password" autocomplete="current-password" required autofocus></label>
        <div class="actions"><button name="decision" value="allow" type="submit">Allow</button><button class="secondary" name="decision" value="deny" type="submit">Deny</button></div>
      </form>`));
  }

  async completeApproval(req: Request, res: Response) {
    const requestId = typeof req.body.request === "string" ? req.body.request : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const decision = req.body.decision === "deny" ? "deny" : "allow";
    if (decision === "allow" && !sameSecret(password, this.password)) {
      const locked = await this.store.access((state) => {
        const key = digest(requestId);
        const pending = state.pending[key];
        if (!pending) return true;
        pending.failedAttempts = (pending.failedAttempts ?? 0) + 1;
        if (pending.failedAttempts >= 5) {
          delete state.pending[key];
          return true;
        }
        return false;
      }, true);
      if (locked) res.set("Retry-After", "600");
      res.status(401).send(this.page("Approval failed", "The approval password was incorrect. Return to your AI client and try connecting again."));
      return;
    }
    const result = await this.store.access((state) => {
      const pendingKey = digest(requestId);
      const pending = state.pending[pendingKey];
      if (!pending) return null;
      delete state.pending[pendingKey];
      if (decision === "deny") return { pending, code: null };
      const code = secret();
      const createdAt = epochSeconds();
      state.codes[digest(code)] = {
        ...pending,
        createdAt,
        expiresAt: createdAt + AUTHORIZATION_CODE_TTL_SECONDS,
      };
      return { pending, code };
    }, true);
    if (!result) {
      res.status(400).send(this.page("Authorization request expired", "Return to your AI client and connect again."));
      return;
    }
    const target = new URL(result.pending.redirectUri);
    if (result.code) target.searchParams.set("code", result.code);
    else target.searchParams.set("error", "access_denied");
    if (result.pending.state) target.searchParams.set("state", result.pending.state);
    res.redirect(302, target.href);
  }

  private issueTokens(state: StoreState, grant: Pick<TokenRecord, "clientId" | "resource" | "scopes">): OAuthTokens {
    const now = epochSeconds();
    const accessToken = secret();
    const refreshToken = secret();
    state.accessTokens[digest(accessToken)] = { ...grant, expiresAt: now + ACCESS_TOKEN_TTL_SECONDS };
    state.refreshTokens[digest(refreshToken)] = { ...grant, expiresAt: now + REFRESH_TOKEN_TTL_SECONDS };
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: grant.scopes.join(" "),
    };
  }

  private page(title: string, content: string) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{font:16px system-ui,sans-serif;max-width:34rem;margin:10vh auto;padding:1.5rem;color:#202124}main{border:1px solid #ddd;border-radius:12px;padding:2rem}label,input{display:block;width:100%;box-sizing:border-box}input{margin:.5rem 0 1.25rem;padding:.7rem}.actions{display:flex;gap:.7rem}button{padding:.7rem 1.1rem;border:0;border-radius:7px;background:#db4c3f;color:white;font-weight:600}.secondary{background:#666}.muted{color:#666}code{overflow-wrap:anywhere}</style></head><body><main><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`;
  }
}
