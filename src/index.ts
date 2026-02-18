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
      const cookieArg = args[2];
      if (!cookieArg) {
        console.error("Usage: substack-article-mcp login --manual <substack.sid value OR full Cookie header>");
        console.error(
          "\nTo get your cookie:\n1. Open your Substack in Chrome (e.g. buildtolaunch.substack.com)\n2. DevTools (F12) → Application → Cookies → select substack.com\n3. Copy either the value of 'substack.sid' or the full Cookie header (so we can use substack.lli for paid articles)"
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

  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log("substack-article-mcp v0.3.2");
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
  substack-article-mcp login             Launch Chrome to log in; subdomain is saved automatically
  substack-article-mcp login --manual <sid or full Cookie>  Paste substack.sid or full Cookie (include substack.lli for paid articles)
  substack-article-mcp login --check     Check authentication status

  After login you can use the MCP in Cursor, Claude Desktop, or Claude Code.
  Add the server to your MCP config once (login can add it to Cursor for you).

  Manual config: add a server with command "npx", args ["-y", "substack-article-mcp"].
  No SUBSTACK_SUBDOMAIN needed — it is stored when you log in.

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
