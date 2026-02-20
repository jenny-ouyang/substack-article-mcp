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
    console.log("substack-article-mcp v0.5.1");
    return;
  }

  // Default: start MCP server
  const { startServer } = await import("./server.js");
  await startServer();
}

function printHelp(): void {
  console.log(`
substack-article-mcp — Substack MCP Server (v0.5.1)

SETUP (run once in your terminal)
  npx -y substack-article-mcp login

  This opens a Chrome window where you enter your email and password.
  Your main Chrome stays open — this is a separate, dedicated window.
  After you log in, it closes automatically and saves your session.

  Alternative (no window): paste cookies from DevTools
  npx -y substack-article-mcp login --manual 'substack.sid=...; substack.lli=...'

OTHER COMMANDS
  npx -y substack-article-mcp login --check    Check if you're authenticated
  npx -y substack-article-mcp --help            Show this help

⚠️  Do NOT run "npx -y substack-article-mcp" with no arguments.
   That starts the MCP stdio server — your terminal will look stuck.
   Cursor/Claude/Claude Code start the server automatically.

MCP TOOLS (available inside your AI app after setup)
  substack_auth_status  list_articles  get_article  search_articles
`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
