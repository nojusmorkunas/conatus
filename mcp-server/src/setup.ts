import { createInterface } from "node:readline/promises";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";

type JsonConfig = { mcpServers?: Record<string, unknown>; [key: string]: unknown };

type ClientTarget = {
  label: string;
  path: string;
};

function targetPaths(): ClientTarget[] {
  const home = homedir();
  if (process.platform === "darwin") {
    return [
      { label: "Claude Desktop", path: join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json") },
      { label: "Cursor", path: join(home, ".cursor", "mcp.json") },
    ];
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return [
      { label: "Claude Desktop", path: join(appData, "Claude", "claude_desktop_config.json") },
      { label: "Cursor", path: join(home, ".cursor", "mcp.json") },
    ];
  }
  return [
    { label: "Claude Desktop", path: join(home, ".config", "Claude", "claude_desktop_config.json") },
    { label: "Cursor", path: join(home, ".cursor", "mcp.json") },
  ];
}

async function readConfig(path: string): Promise<JsonConfig> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("must contain a JSON object");
    }
    return parsed as JsonConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Couldn't read ${path}: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

function normalizeBaseUrl(value: string): URL {
  const url = new URL(value.trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("The Conatus URL must start with http:// or https://.");
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

async function verifyConnection(baseUrl: URL, token: string) {
  const response = await fetch(new URL("/api/v1/context", baseUrl), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Conatus rejected that URL or API token. Nothing was written.");
}

export async function runSetup() {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Setup needs an interactive terminal. Configure TASKS_BASE_URL and TASKS_API_TOKEN directly for non-interactive use.");
  }
  const prompt = createInterface({ input, output });
  try {
    const baseUrl = normalizeBaseUrl(await prompt.question("Conatus URL (for example https://tasks.example.com): "));
    const token = (await prompt.question("Scoped Conatus API token: ")).trim();
    if (!/^(?:tdc|tdm)_[A-Za-z0-9_-]{32}$/.test(token)) {
      throw new Error("That API token has an invalid format. Nothing was written.");
    }
    output.write("Checking the connection…\n");
    await verifyConnection(baseUrl, token);

    const targets = targetPaths();
    targets.forEach((target, index) => output.write(`${index + 1}. ${target.label} (${target.path})\n`));
    output.write(`${targets.length + 1}. Another JSON MCP config file\n`);
    const selection = Number(await prompt.question("Choose a client: "));
    let configPath: string;
    if (selection >= 1 && selection <= targets.length) {
      configPath = targets[selection - 1].path;
    } else if (selection === targets.length + 1) {
      configPath = (await prompt.question("Path to JSON MCP config: ")).trim();
      if (!configPath) throw new Error("No config path was provided. Nothing was written.");
    } else {
      throw new Error("Choose one of the displayed options. Nothing was written.");
    }

    const config = await readConfig(configPath);
    const servers = { ...(config.mcpServers ?? {}) };
    servers.conatus = {
      command: "npx",
      args: ["-y", "@conatus/mcp-server"],
      env: { TASKS_BASE_URL: baseUrl.href.replace(/\/$/, ""), TASKS_API_TOKEN: token },
    };
    config.mcpServers = servers;
    await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await chmod(configPath, 0o600);
    output.write(`Conatus MCP was added to ${configPath}. Restart your client to load it.\n`);
  } finally {
    prompt.close();
  }
}
