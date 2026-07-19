import { describe, expect, test } from "vitest";

import { loadConfig } from "./config.js";

const token = `tdm_${"a".repeat(32)}`;

describe("loadConfig", () => {
  test("loads safe local defaults", () => {
    const config = loadConfig({
      TASKS_BASE_URL: "http://localhost:3000/",
      TASKS_API_TOKEN: token,
    });

    expect(config.baseUrl.href).toBe("http://localhost:3000/");
    expect(config.http.host).toBe("127.0.0.1");
    expect(config.http.port).toBe(3001);
    expect(config.http.publicUrl).toBeNull();
    expect(config.requestTimeoutMs).toBe(15_000);
  });

  test("rejects invalid task token formats", () => {
    expect(() =>
      loadConfig({ TASKS_BASE_URL: "http://localhost:3000", TASKS_API_TOKEN: "secret" }),
    ).toThrow("invalid format");
  });

  test("rejects non-http task manager addresses", () => {
    expect(() =>
      loadConfig({ TASKS_BASE_URL: "file:///tmp/tasks", TASKS_API_TOKEN: token }),
    ).toThrow("http or https");
  });

  test("loads OAuth remote mode", () => {
    const config = loadConfig({
      TASKS_BASE_URL: "https://tasks.example.com",
      TASKS_API_TOKEN: token,
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp/",
      MCP_OAUTH_PASSWORD: "a-long-approval-password",
      MCP_OAUTH_STORE_PATH: "/data/oauth.json",
    });

    expect(config.http.publicUrl?.href).toBe("https://mcp.example.com/mcp");
    expect(config.http.oauthStorePath).toBe("/data/oauth.json");
  });

  test("requires complete and strong OAuth configuration", () => {
    expect(() => loadConfig({
      TASKS_BASE_URL: "https://tasks.example.com",
      TASKS_API_TOKEN: token,
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    })).toThrow("configured together");
    expect(() => loadConfig({
      TASKS_BASE_URL: "https://tasks.example.com",
      TASKS_API_TOKEN: token,
      MCP_PUBLIC_URL: "https://mcp.example.com/not-mcp",
      MCP_OAUTH_PASSWORD: "a-long-approval-password",
    })).toThrow("ending in /mcp");
    expect(() => loadConfig({
      TASKS_BASE_URL: "https://tasks.example.com",
      TASKS_API_TOKEN: token,
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      MCP_OAUTH_PASSWORD: "too-short",
    })).toThrow("at least 16 bytes");
  });
});
