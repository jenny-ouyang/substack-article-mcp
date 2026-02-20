# substack-article-mcp

MCP server for Substack — access your articles (including paid/premium), reader feed, subscriptions, comments, and engagement data from Cursor, Claude Desktop, Claude Code, or any MCP client.

---

## Quick Start

### Step 1: Log in (once)

```bash
npx -y substack-article-mcp login
```

A Chrome window opens where you enter your Substack email and password. **Your main Chrome stays open** — this is a separate, dedicated window that closes automatically after login.

The tool saves your session cookie and detects your newsletter subdomain. At the end, it offers to add the MCP to Cursor for you.

**Alternative (no window):** If you'd rather paste cookies from DevTools:

```bash
npx -y substack-article-mcp login --manual 'substack.sid=PASTE_HERE; substack.lli=PASTE_HERE'
```

To get the values: DevTools (F12) → Application → Cookies → substack.com → copy `substack.sid` (and `substack.lli` for full paid-article access).

### Step 2: Add the MCP to your app (if you didn't during login)

**Claude Desktop (one-click):** Download the `.mcpb` file from the [Releases page](https://github.com/jenny-ouyang/substack-article-mcp/releases) and double-click to install.

**Cursor** — edit `~/.cursor/mcp.json`:

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

**Claude Desktop** (manual — macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`): same format.

**Claude Code:**

```bash
claude mcp add substack -- npx -y substack-article-mcp
```

Restart Cursor / Claude after changing config.

### Step 3: Use it

Ask from chat — the app starts the server automatically:

- "List my recent Substack articles"
- "Get the full content of article 184929446" *(works with numeric IDs)*
- "Get the article about AI tools from platformer" *(reads someone else's newsletter)*
- "Show me the comments on my latest article"
- "What newsletters do I subscribe to?"
- "Show me my reader feed — what's new from my subscriptions?"
- "Search my articles for [keyword]"

---

## CLI commands

| Command | What it does |
|---------|-------------|
| `npx -y substack-article-mcp login` | Opens a Chrome window to log in. Saves your session. |
| `npx -y substack-article-mcp login --manual '...'` | Paste cookies from DevTools (no new window). |
| `npx -y substack-article-mcp login --check` | Check auth status and cookie age. |
| `npx -y substack-article-mcp --help` | Show help. |

> **Do not** run `npx -y substack-article-mcp` with no arguments in your terminal. That starts the MCP stdio server and your terminal will look stuck. Cursor/Claude run it for you.

---

## MCP tools

| Tool | Description |
|------|-------------|
| `substack_auth_status` | Check if auth is valid, cookie age, subdomain. |
| `list_articles` | List published articles (metadata, engagement, paid/free). |
| `get_article` | Full article as markdown. Accepts a slug *or* numeric post ID. Includes premium content. |
| `search_articles` | Search published articles by keyword. |
| `get_comments` | Full comment tree — every comment, reply, author name, reactions. Accepts slug or ID. |
| `list_subscriptions` | List all newsletters you subscribe to (paid, comped, and free). |
| `get_feed` | Your personalized reader feed — recent posts from subscribed newsletters. |

All content tools accept an optional `subdomain` parameter. This means you can read articles from **any** Substack newsletter you subscribe to, not just your own. For example, specify `subdomain: "platformer"` to read Platformer articles.

`get_article` and `get_comments` also accept numeric post IDs (e.g. `184929446`) in addition to text slugs. When using an ID, the publication is auto-detected — no subdomain needed.

---

## How auth works

1. Run `login` once (and again when the session expires, typically every few weeks).
2. The tool saves `substack.sid`, `substack.lli` (for paid content), and your subdomain to `~/.substack-article-mcp/auth.json`.
3. The MCP server reads that file and sends cookies to Substack's API. No environment variables needed.

**What about my main Chrome?** The `login` command uses a dedicated Chrome profile stored in `~/.substack-article-mcp/chrome-profile/`. This is completely separate from your regular Chrome — it does not touch your tabs, extensions, or browsing data.

**Where does this run?** Entirely on your local machine. The MCP server runs as a subprocess of Cursor/Claude, communicating over stdio. No cloud hosting, no intermediary servers — your credentials never leave your computer.

---

## Requirements

- **Node.js** 18+
- **Google Chrome** (for the `login` command only)

## Disclaimer

Uses Substack's internal APIs. Use for personal/experimental purposes. Not affiliated with Substack.

## License

MIT
