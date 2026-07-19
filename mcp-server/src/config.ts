export type ServerConfig = {
  baseUrl: URL;
  apiToken: string;
  requestTimeoutMs: number;
  http: {
    host: string;
    port: number;
    allowedOrigins: string[];
    bearerToken: string | null;
    publicUrl: URL | null;
    oauthPassword: string | null;
    oauthStorePath: string;
  };
};

function required(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const baseUrl = new URL(required(env, "TASKS_BASE_URL"));
  if (!/^https?:$/.test(baseUrl.protocol)) {
    throw new Error("TASKS_BASE_URL must use http or https");
  }
  baseUrl.pathname = baseUrl.pathname.replace(/\/$/, "");
  const apiToken = required(env, "TASKS_API_TOKEN");
  if (!/^(?:tdc|tdm)_[A-Za-z0-9_-]{32}$/.test(apiToken)) {
    throw new Error("TASKS_API_TOKEN has an invalid format");
  }
  const port = Number(env.MCP_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MCP_PORT must be an integer between 1 and 65535");
  }
  const requestTimeoutMs = Number(env.TASKS_REQUEST_TIMEOUT_MS ?? 15_000);
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000) {
    throw new Error("TASKS_REQUEST_TIMEOUT_MS must be at least 1000");
  }
  const publicUrlValue = env.MCP_PUBLIC_URL?.trim();
  const publicUrl = publicUrlValue ? new URL(publicUrlValue) : null;
  if (publicUrl) {
    if (!/^https?:$/.test(publicUrl.protocol)) {
      throw new Error("MCP_PUBLIC_URL must use http or https");
    }
    if (publicUrl.pathname.replace(/\/$/, "") !== "/mcp" || publicUrl.search || publicUrl.hash) {
      throw new Error("MCP_PUBLIC_URL must be the public MCP endpoint ending in /mcp");
    }
    publicUrl.pathname = "/mcp";
  }
  const oauthPassword = env.MCP_OAUTH_PASSWORD?.trim() || null;
  if ((publicUrl && !oauthPassword) || (!publicUrl && oauthPassword)) {
    throw new Error("MCP_PUBLIC_URL and MCP_OAUTH_PASSWORD must be configured together");
  }
  if (oauthPassword && Buffer.byteLength(oauthPassword) < 16) {
    throw new Error("MCP_OAUTH_PASSWORD must be at least 16 bytes");
  }

  return {
    baseUrl,
    apiToken,
    requestTimeoutMs,
    http: {
      host: env.MCP_HOST?.trim() || "127.0.0.1",
      port,
      allowedOrigins: (env.MCP_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      bearerToken: env.MCP_BEARER_TOKEN?.trim() || null,
      publicUrl,
      oauthPassword,
      oauthStorePath: env.MCP_OAUTH_STORE_PATH?.trim() || "./data/oauth-store.json",
    },
  };
}
