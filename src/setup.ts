import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

const MCP_SERVER_NAME = "substack";

const SERVER_ENTRY = {
  command: "npx",
  args: ["-y", "substack-article-mcp"],
} as const;

export type ClientId = "cursor" | "claude-desktop" | "claude-code";

interface ConfigPaths {
  cursor: string;
  "claude-desktop": string;
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

/**
 * Add the MCP server entry to a JSON config file (Cursor or Claude Desktop).
 */
export function addToConfig(client: "cursor" | "claude-desktop"): { path: string; updated: boolean } {
  const paths = getConfigPaths();
  const path = paths[client];

  const config = readJsonPath(path);
  const base = config ? ensureMcpServers(config) : { mcpServers: {} };
  const mcpServers = base.mcpServers as Record<string, unknown>;
  const existing = mcpServers[MCP_SERVER_NAME];

  const entry = { command: SERVER_ENTRY.command, args: [...SERVER_ENTRY.args] };

  const same =
    existing &&
    typeof existing === "object" &&
    (existing as Record<string, unknown>).command === entry.command &&
    Array.isArray((existing as Record<string, unknown>).args) &&
    JSON.stringify((existing as Record<string, unknown>).args) === JSON.stringify(entry.args);

  if (same) {
    return { path, updated: false };
  }

  mcpServers[MCP_SERVER_NAME] = entry;
  writeJsonPath(path, base);
  return { path, updated: true };
}

/**
 * Add MCP to Claude Code via `claude mcp add` CLI command.
 */
export function addToClaudeCode(): { success: boolean; output: string } {
  const cmd = `claude mcp add -s user ${MCP_SERVER_NAME} -- npx -y substack-article-mcp`;
  try {
    const output = execSync(cmd, {
      encoding: "utf-8",
      timeout: 15_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return { success: true, output: output || "MCP server added to Claude Code." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists")) {
      return { success: true, output: "MCP server already configured in Claude Code." };
    }
    return { success: false, output: `Failed to add MCP to Claude Code: ${msg}` };
  }
}

export function removeFromConfig(client: "cursor" | "claude-desktop"): { path: string; removed: boolean } {
  const paths = getConfigPaths();
  const path = paths[client];

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

export function getConfigPathsForHelp(): ConfigPaths {
  return getConfigPaths();
}
