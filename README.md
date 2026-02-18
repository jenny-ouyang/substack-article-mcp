# substack-article-mcp

MCP server for Substack — access your articles, notes, and engagement data from Claude, Cursor, Claude Desktop, or any MCP client.

**Authenticated access** means you get full content for premium/paywalled articles, not just the free preview.

## Quick Start

### Easy install (one command)

Like [NotebookLM MCP](https://github.com/jacob-bd/notebooklm-mcp-cli), you can add the MCP to your app without editing config files:

```bash
# Add to Cursor (writes ~/.cursor/mcp.json)
npx -y substack-article-mcp setup add cursor

# Or Claude Desktop
npx -y substack-article-mcp setup add claude-desktop

# See where it's configured
npx -y substack-article-mcp setup list
```

You’ll be prompted for your Substack subdomain (e.g. `buildtolaunch`) if `SUBSTACK_SUBDOMAIN` isn’t set. Then restart Cursor or Claude Desktop.

### 1. Authenticate

```bash
npx -y substack-article-mcp login
```

This opens Chrome, you log into Substack, and the session cookie is saved automatically. One-time setup that lasts ~2-4 weeks.

**Alternative** (manual cookie paste):

```bash
npx -y substack-article-mcp login --manual "your-substack-sid-cookie-value"
```

### 2. Configure Your MCP Client (manual)

If you prefer to edit config yourself, add to your MCP configuration:

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "substack": {
      "command": "npx",
      "args": ["-y", "substack-article-mcp"],
      "env": {
        "SUBSTACK_SUBDOMAIN": "your-subdomain"
      }
    }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "substack": {
      "command": "npx",
      "args": ["-y", "substack-article-mcp"],
      "env": {
        "SUBSTACK_SUBDOMAIN": "your-subdomain"
      }
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add substack -- npx -y substack-article-mcp
```

Then set the environment variable `SUBSTACK_SUBDOMAIN` in your shell or MCP config.

Your **subdomain** is the part before `.substack.com` in your newsletter URL. For example: `buildtolaunch.substack.com` → subdomain is `buildtolaunch`.

### 3. Use It

Just talk to your AI assistant:

- "List my recent Substack articles"
- "Get the full content of my article about Claude Code"
- "Search my articles for posts about vibe coding"
- "Check my Substack auth status"

## Available Tools

| Tool | Description |
|------|-------------|
| `substack_auth_status` | Check if authentication is valid, show cookie age |
| `list_articles` | List published articles with metadata (title, date, slug, engagement, paid/free) |
| `get_article` | Get full article content as markdown (includes premium content when authenticated) |
| `search_articles` | Search published articles by keyword |

## CLI Commands

```bash
substack-article-mcp                         # Start the MCP server
substack-article-mcp login                   # Authenticate via Chrome (automated)
substack-article-mcp login --manual <sid>    # Authenticate with a pasted cookie value
substack-article-mcp login --check           # Check authentication status
substack-article-mcp setup add cursor        # Add to Cursor (easy install)
substack-article-mcp setup add claude-desktop # Add to Claude Desktop
substack-article-mcp setup list              # Show config status
substack-article-mcp setup remove <client>   # Remove from config
substack-article-mcp --help                  # Show help
```

## How Authentication Works

Substack doesn't have a public API. This MCP uses the same internal API that the Substack website uses, authenticated with your browser session cookie.

1. **`substack-article-mcp login`** launches Chrome with a dedicated profile
2. You log into Substack in the browser window
3. The `substack.sid` cookie is automatically extracted via Chrome DevTools Protocol
4. The cookie is stored locally at `~/.substack-article-mcp/auth.json`
5. The MCP server reads this cookie to make authenticated API requests

**Security notes:**
- Your cookie is stored locally on your machine only (`~/.substack-article-mcp/auth.json`)
- The cookie is never sent anywhere except to `substack.com` API endpoints
- Chrome profile data stays in `~/.substack-article-mcp/chrome-profile/`
- Re-authenticate by running `substack-article-mcp login` again when the cookie expires (~2-4 weeks)

## Requirements

- **Node.js** 18 or later
- **Google Chrome** (for the `login` command — the MCP server itself doesn't need Chrome)

## Disclaimer

This MCP uses Substack's internal APIs which are undocumented and may change without notice. Use for personal/experimental purposes. Not affiliated with Substack.

## License

MIT
