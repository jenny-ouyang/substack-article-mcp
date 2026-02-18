# substack-article-mcp

MCP server for Substack — access your articles, notes, and engagement data from Claude, Cursor, Claude Desktop, or any MCP client.

**Authenticated access** means you get full content for premium/paywalled articles, not just the free preview.

## Quick Start

### 1. Log in (that’s it)

```bash
npx -y substack-article-mcp login
```

This opens Chrome; you log into Substack. Your session cookie and **subdomain** are saved automatically. No need to set `SUBSTACK_SUBDOMAIN` anywhere — the tool detects your newsletter from your login.

At the end of login you can choose to add the MCP to Cursor in one step (writes `~/.cursor/mcp.json`). Restart Cursor and you’re done.

**Manual cookie** (if you prefer):

```bash
npx -y substack-article-mcp login --manual "your-substack-sid-cookie-value"
```

If you use manual login, set `SUBSTACK_SUBDOMAIN` in your environment or the server will prompt you to run browser login so it can detect your subdomain.

### 2. Add the MCP to your app (if you didn’t during login)

Add the server once to your MCP config. No `SUBSTACK_SUBDOMAIN` in env — the server uses the subdomain stored at login.

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "substack": {
      "command": "npx",
      "args": ["-y", "substack-article-mcp"]
    }
  }
}
```

**Claude Desktop** (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "substack": {
      "command": "npx",
      "args": ["-y", "substack-article-mcp"]
    }
  }
}
```

**Claude Code** (no config file — add via CLI):

```bash
claude mcp add substack -- npx -y substack-article-mcp
```

After login, subdomain is in `~/.substack-article-mcp/auth.json`, so you don’t need to set it for Claude Code either.

### 3. Use it

- “List my recent Substack articles”
- “Get the full content of my article about Claude Code”
- “Search my articles for posts about vibe coding”
- “Check my Substack auth status”

## Available Tools

| Tool | Description |
|------|-------------|
| `substack_auth_status` | Check if authentication is valid, show cookie age and subdomain |
| `list_articles` | List published articles with metadata (title, date, slug, engagement, paid/free) |
| `get_article` | Get full article content as markdown (includes premium content when authenticated) |
| `search_articles` | Search published articles by keyword |

## CLI Commands

```bash
substack-article-mcp                         # Start the MCP server
substack-article-mcp login                   # Log in via Chrome (saves cookie + subdomain)
substack-article-mcp login --manual <sid>    # Paste cookie manually (subdomain not auto-detected)
substack-article-mcp login --check           # Check authentication status
substack-article-mcp --help                  # Show help
```

## How Authentication Works

Substack doesn’t expose a public API. This MCP uses the same internal API the Substack site uses, authenticated with your browser session cookie.

1. **`substack-article-mcp login`** launches Chrome with a dedicated profile.
2. You log into Substack in the browser.
3. The `substack.sid` cookie is extracted via Chrome DevTools Protocol.
4. The tool detects which newsletter you’re on (subdomain) from the post-login URL.
5. Cookie and subdomain are stored in `~/.substack-article-mcp/auth.json`.
6. The MCP server reads this file for all API requests — no env vars required.

**Security:**

- Cookie and subdomain are stored only on your machine (`~/.substack-article-mcp/auth.json`).
- The cookie is only sent to Substack API endpoints.
- Chrome profile data stays in `~/.substack-article-mcp/chrome-profile/`.
- Re-run `substack-article-mcp login` when the session expires (typically every few weeks).

## Requirements

- **Node.js** 18+
- **Google Chrome** (for the `login` command only; the MCP server does not need Chrome)

## Disclaimer

This MCP uses Substack’s internal APIs, which are undocumented and may change. Use for personal/experimental purposes. Not affiliated with Substack.

## License

MIT
