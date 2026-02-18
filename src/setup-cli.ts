import * as readline from "node:readline";
import {
  addToConfig,
  removeFromConfig,
  listConfigStatus,
  getConfigPathsForHelp,
} from "./setup.js";

type ClientId = "cursor" | "claude-desktop" | "claude-code";

const CLIENTS: ClientId[] = ["cursor", "claude-desktop", "claude-code"];

function promptSubdomain(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("Your Substack subdomain (e.g. buildtolaunch): ", (answer) => {
      rl.close();
      resolve((answer || "").trim() || "your-subdomain");
    });
  });
}

export async function runSetup(args: string[]): Promise<void> {
  const sub = args[0];
  const clientArg = args[1];

  if (sub === "add") {
    const client = clientArg as ClientId | undefined;
    if (!client || !CLIENTS.includes(client)) {
      console.error("Usage: substack-article-mcp setup add <cursor | claude-desktop | claude-code>");
      console.error("Example: substack-article-mcp setup add cursor");
      process.exit(1);
    }

    let subdomain = process.env["SUBSTACK_SUBDOMAIN"] || "";
    if (!subdomain) {
      subdomain = await promptSubdomain();
    }

    if (client === "claude-code") {
      console.log("\nClaude Code does not use a config file. Add the MCP manually:");
      console.log("  claude mcp add substack -- npx -y substack-article-mcp");
      console.log("\nThen set your subdomain (e.g. in your shell profile):");
      console.log('  export SUBSTACK_SUBDOMAIN="buildtolaunch"');
      return;
    }

    try {
      const { path, updated } = addToConfig(client, subdomain);
      if (updated) {
        console.log(`\n✅ Added substack-article-mcp to ${client}`);
        console.log(`   Config: ${path}`);
        console.log(`   Subdomain: ${subdomain}`);
        console.log("\nRestart your app (Cursor or Claude Desktop) to use the MCP.");
      } else {
        console.log(`\n✅ Already configured for ${client} (${path})`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (sub === "remove") {
    const client = clientArg as ClientId | undefined;
    if (!client || !CLIENTS.includes(client)) {
      console.error("Usage: substack-article-mcp setup remove <cursor | claude-desktop>");
      process.exit(1);
    }
    if (client === "claude-code") {
      console.error("Claude Code has no config file to edit. Remove the MCP with: claude mcp remove substack");
      process.exit(1);
    }
    try {
      const { path, removed } = removeFromConfig(client);
      if (removed) {
        console.log(`\n✅ Removed substack-article-mcp from ${client} (${path})`);
      } else {
        console.log(`\nNot configured for ${client} (${path})`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (sub === "list") {
    const status = listConfigStatus();
    const paths = getConfigPathsForHelp();
    console.log("\nSubstack Article MCP — config status:\n");
    for (const { client, path, configured } of status) {
      const label = configured ? "✅" : "—";
      const pathDisplay = path.startsWith("(") ? path : path;
      console.log(`  ${label} ${client.padEnd(18)} ${pathDisplay}`);
    }
    console.log("\nTo add: substack-article-mcp setup add <cursor | claude-desktop | claude-code>");
    return;
  }

  console.error("Usage:");
  console.error("  substack-article-mcp setup add <cursor | claude-desktop | claude-code>");
  console.error("  substack-article-mcp setup remove <cursor | claude-desktop>");
  console.error("  substack-article-mcp setup list");
  process.exit(1);
}
