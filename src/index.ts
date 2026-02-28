#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function getVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(dir, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.7.0";
  }
}

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  // ─── install ────────────────────────────────────────────────
  if (command === "install") {
    const flag = args[1];

    if (flag === "--cursor") {
      console.log("Step 1/2: Logging in to Substack...\n");
      const { runLogin } = await import("./auth.js");
      await runLogin();

      console.log("\nStep 2/2: Adding MCP to Cursor...\n");
      const { addToConfig } = await import("./setup.js");
      const { path, updated } = addToConfig("cursor");
      if (updated) {
        console.log(`   Added to ${path}`);
      } else {
        console.log(`   Already configured in ${path}`);
      }
      console.log("\n✅ Done! Restart Cursor to start using the Substack MCP.");
      return;
    }

    if (flag === "--claude-code") {
      console.log("Step 1/2: Logging in to Substack...\n");
      const { runLogin } = await import("./auth.js");
      await runLogin();

      console.log("\nStep 2/2: Adding MCP to Claude Code...\n");
      const { addToClaudeCode } = await import("./setup.js");
      const { success, output } = addToClaudeCode();
      console.log(`   ${output}`);
      if (success) {
        console.log("\n✅ Done! The Substack MCP is now available in Claude Code.");
      } else {
        console.log('\n⚠️  Could not add automatically. Run this manually:');
        console.log("   claude mcp add -s user substack -- npx -y substack-article-mcp");
      }
      return;
    }

    // No flag or unknown flag — show install help
    console.log(`
substack-article-mcp install — One-step setup

Choose your AI client:

  npx -y substack-article-mcp install --cursor
    Log in + add MCP to Cursor (restart Cursor afterward)

  npx -y substack-article-mcp install --claude-code
    Log in + add MCP to Claude Code

  Claude Desktop:
    Install the .mcpb extension from quickviralnotes.com/mcp-setup
    Or download from the GitHub releases page.
`);
    return;
  }

  // ─── login ──────────────────────────────────────────────────
  if (command === "login") {
    const flag = args[1];

    if (flag === "--check" || flag === "--status") {
      const { checkAuthStatus } = await import("./auth.js");
      const status = await checkAuthStatus();

      if (status.authenticated) {
        console.log("✅ Authenticated");
        console.log(`   Source: ${status.authSource || "unknown"}`);
        console.log(`   Cookie age: ${status.cookieAge}`);
        console.log(
          `   Subdomain: ${status.subdomain || process.env["SUBSTACK_SUBDOMAIN"] || "(not set)"}`
        );
      } else {
        console.log("❌ Not authenticated");
        console.log('   Run "npx -y substack-article-mcp login" to connect your account.');
      }
      return;
    }

    if (flag === "--manual") {
      const cookieArg = args[2];
      if (!cookieArg) {
        console.error("Usage: npx -y substack-article-mcp login --manual <cookie>");
        console.error(
          '\nTo get your cookie:\n1. Open Substack in Chrome\n2. DevTools (F12) → Application → Cookies → substack.com\n3. Copy either:\n   - The value of "substack.sid"\n   - OR the full Cookie header: "substack.sid=...; substack.lli=..."'
        );
        process.exit(1);
      }
      const { runManualLogin } = await import("./auth.js");
      await runManualLogin(cookieArg);
      return;
    }

    const { runLogin } = await import("./auth.js");
    await runLogin();
    return;
  }

  // ─── help / version ─────────────────────────────────────────
  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(`substack-article-mcp v${getVersion()}`);
    return;
  }

  // ─── Default: start MCP server ──────────────────────────────
  const { startServer } = await import("./server.js");
  await startServer();
}

function printHelp(): void {
  const v = getVersion();
  console.log(`
substack-article-mcp — Substack MCP Server (v${v})

INSTALL (one-step setup for your AI client)
  npx -y substack-article-mcp install --cursor       Cursor
  npx -y substack-article-mcp install --claude-code   Claude Code
  Claude Desktop: install the .mcpb extension

LOGIN (refresh credentials only, no client changes)
  npx -y substack-article-mcp login                   Chrome login flow
  npx -y substack-article-mcp login --manual <cookie>  Paste cookie directly
  npx -y substack-article-mcp login --check            Check auth status

OTHER
  npx -y substack-article-mcp --version
  npx -y substack-article-mcp --help

NOTE: Public articles work without logging in.
      Log in to access paid articles, subscriptions, feed, and inbox.

MCP TOOLS (available inside your AI app)
  substack_auth_status  list_articles  get_article  search_articles
  get_comments          list_subscriptions          get_feed
  get_inbox
`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
