#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  if (command === "login") {
    const flag = args[1];

    if (flag === "--check" || flag === "--status") {
      const { checkAuthStatus } = await import("./auth.js");
      const status = await checkAuthStatus();

      if (status.authenticated) {
        console.log("✅ Authenticated");
        console.log(`   Cookie age: ${status.cookieAge}`);
        console.log(
          `   Subdomain: ${status.subdomain || process.env["SUBSTACK_SUBDOMAIN"] || "(not set)"}`
        );
      } else {
        console.log("❌ Not authenticated");
        console.log('   Run "substack-article-mcp login" to connect your account.');
      }
      return;
    }

    if (flag === "--manual") {
      const sid = args[2];
      if (!sid) {
        console.error("Usage: substack-article-mcp login --manual <substack.sid value>");
        console.error(
          "\nTo get your cookie value:\n1. Open substack.com in Chrome\n2. Open DevTools (F12) → Application → Cookies\n3. Copy the value of 'substack.sid'"
        );
        process.exit(1);
      }
      const { runManualLogin } = await import("./auth.js");
      await runManualLogin(sid);
      return;
    }

    const { runLogin } = await import("./auth.js");
    await runLogin();
    return;
  }

  if (command === "setup") {
    const { runSetup } = await import("./setup-cli.js");
    await runSetup(args.slice(1));
    return;
  }

  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log("substack-article-mcp v0.2.0");
    return;
  }

  // Default: start MCP server
  const { startServer } = await import("./server.js");
  await startServer();
}

function printHelp(): void {
  console.log(`
substack-article-mcp — Substack MCP Server

USAGE
  substack-article-mcp                    Start the MCP server (stdio transport)
  substack-article-mcp login              Launch Chrome to authenticate with Substack
  substack-article-mcp login --manual <sid>  Manually provide your substack.sid cookie
  substack-article-mcp login --check      Check current authentication status

  substack-article-mcp setup add cursor         Add to Cursor (~/.cursor/mcp.json)
  substack-article-mcp setup add claude-desktop Add to Claude Desktop
  substack-article-mcp setup add claude-code    Show instructions for Claude Code
  substack-article-mcp setup list               Show where MCP is configured
  substack-article-mcp setup remove <client>   Remove from cursor or claude-desktop

  Example (easy install):
  npx -y substack-article-mcp setup add cursor
  (prompts for subdomain if needed, then restart Cursor)

MCP CLIENT CONFIGURATION (manual)

  Your subdomain is the part before .substack.com in your newsletter URL.
  For example: buildtolaunch.substack.com → subdomain is "buildtolaunch"

ENVIRONMENT VARIABLES
  SUBSTACK_SUBDOMAIN    Your Substack subdomain (required)

MCP TOOLS
  substack_auth_status  Check authentication status
  list_articles         List published articles with metadata
  get_article           Get full article content as markdown
  search_articles       Search articles by keyword
`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
