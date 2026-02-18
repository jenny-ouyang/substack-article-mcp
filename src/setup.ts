import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

const MCP_SERVER_NAME = "substack";

const SERVER_ENTRY = {
  command: "npx",
  args: ["-y", "substack-article-mcp"],
  env: {
    SUBSTACK_SUBDOMAIN: "your-subdomain",
  },
} as const;

type ClientId = "cursor" | "claude-desktop" | "claude-code";

interface ConfigPaths {
  cursor: string;
  "claude-desktop": string;
  "claude-code": string | null;
}

function getConfigPaths(): ConfigPaths {
  const home = homedir();
  const isMac = platform() === "darwin";
  const isWin = platform() === "win32";

  const cursorPath =
    process.env["CURSOR_MCP_CONFIG"] ||
    join(home, ".cursor", "mcp.json");

  let claudeDesktopPath: string;
  if (isWin) {
    claudeDesktopPath = join(
      process.env["APPDATA"] || join(home, "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json"
    );
  } else if (isMac) {
    claudeDesktopPath = join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  } else {
    claudeDesktopPath = join(home, ".config", "Claude", "claude_desktop_config.json");
  }

  return {
    cursor: cursorPath,
    "claude-desktop": claudeDesktopPath,
    "claude-code": null,
  };
}

function readJsonPath(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeJsonPath(path: string, data: Record<string, unknown>): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function ensureMcpServers(config: Record<string, unknown>): Record<string, unknown> {
  if (!config["mcpServers"] || typeof config["mcpServers"] !== "object") {
    return { ...config, mcpServers: {} };
  }
  return config;
}

export function addToConfig(client: ClientId, subdomain: string): { path: string; updated: boolean } {
  const paths = getConfigPaths();
  const path = paths[client];
  if (!path) {
    throw new Error("claude-code does not use a config file; use: claude mcp add substack -- npx -y substack-article-mcp");
  }

  const config = readJsonPath(path);
  const base = config ? ensureMcpServers(config) : { mcpServers: {} };
  const mcpServers = base.mcpServers as Record<string, unknown>;
  const existing = mcpServers[MCP_SERVER_NAME];

  const entry = {
    command: SERVER_ENTRY.command,
    args: SERVER_ENTRY.args,
    env: { SUBSTACK_SUBDOMAIN: subdomain },
  };

  const same =
    existing &&
    typeof existing === "object" &&
    (existing as Record<string, unknown>).command === entry.command &&
    JSON.stringify((existing as Record<string, unknown>).env) === JSON.stringify(entry.env);

  if (same) {
    return { path, updated: false };
  }

  mcpServers[MCP_SERVER_NAME] = entry;
  writeJsonPath(path, base);
  return { path, updated: true };
}

export function removeFromConfig(client: ClientId): { path: string; removed: boolean } {
  const paths = getConfigPaths();
  const path = paths[client];
  if (!path) {
    throw new Error("claude-code has no config file to edit.");
  }

  const config = readJsonPath(path);
  if (!config?.mcpServers || typeof config.mcpServers !== "object") {
    return { path, removed: false };
  }

  const mcpServers = config.mcpServers as Record<string, unknown>;
  if (!(MCP_SERVER_NAME in mcpServers)) {
    return { path, removed: false };
  }

  delete mcpServers[MCP_SERVER_NAME];
  writeJsonPath(path, config);
  return { path, removed: true };
}

export function listConfigStatus(): Array<{ client: string; path: string; configured: boolean }> {
  const paths = getConfigPaths();
  const results: Array<{ client: string; path: string; configured: boolean }> = [];

  for (const [client, path] of Object.entries(paths)) {
    if (!path) {
      results.push({
        client: client as string,
        path: "(claude mcp add)",
        configured: false,
      });
      continue;
    }
    const config = readJsonPath(path);
    const mcpServers = config?.mcpServers && typeof config.mcpServers === "object" ? config.mcpServers : {};
    const configured = MCP_SERVER_NAME in (mcpServers as Record<string, unknown>);
    results.push({ client: client as string, path, configured });
  }

  return results;
}

export function getConfigPathsForHelp(): ConfigPaths {
  return getConfigPaths();
}
