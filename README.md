# substack-article-mcp

MCP server for Substack — read articles, comments, feed, and subscriptions from Cursor, Claude Desktop, Claude Code, or any MCP client. Public content works without authentication; log in for premium/paywalled articles and personalized features.

---

## Quick Start

Choose your AI client:

### Cursor

One command — logs in and configures Cursor automatically:

```bash
npx -y substack-article-mcp install --cursor
```

Restart Cursor after installation.

### Claude Code

One command — logs in and adds the MCP globally:

```bash
npx -y substack-article-mcp install --claude-code
```

### Claude Desktop

Download the `.mcpb` extension from the [Releases page](https://github.com/jenny-ouyang/substack-article-mcp/releases) and double-click to install.

**Optional:** After installing, go to Extensions > Substack Articles > Settings and paste your Substack cookie to unlock paid articles, subscriptions, and your feed. Leave it empty for public-only access.

### Use it

Ask from chat — the app starts the server automatically:

- "List recent articles from platformer" *(public, no auth needed)*
- "Get the full content of article 184929446" *(works with numeric IDs)*
- "Show me the comments on this article"
- "Search platformer articles for 'antitrust'"
- "What newsletters do I subscribe to?" *(requires auth)*
- "Show me my reader feed" *(requires auth)*

---

## Authentication

**Authentication is optional.** Public tools (`list_articles`, `get_article`, `search_articles`, `get_comments`) work without any credentials as long as you specify a subdomain.

Log in to unlock:
- Full paid/premium article content
- `list_subscriptions` — see all newsletters you follow
- `get_feed` — your personalized reader feed
- `get_inbox` — chronological inbox from all subscriptions
- Auto-detected default subdomain (so you don't need to specify one)

### How auth works

The server checks for credentials in this priority order:

1. **`SUBSTACK_COOKIE` environment variable** — used by Claude Desktop's `.mcpb` extension (set automatically from the optional cookie field in settings)
2. **`~/.substack-article-mcp/auth.json`** — saved by the `login` or `install` command
3. **No auth** — public content only

### Refreshing credentials

Substack cookies expire every few weeks. When tools start returning auth errors:

- **Cursor / Claude Code:** Run `npx -y substack-article-mcp login` in your terminal
- **Claude Desktop:** Go to Extensions > Substack Articles > Settings and paste a fresh cookie

### Getting your cookie manually

1. Open substack.com in Chrome and log in
2. DevTools (F12) → Application → Cookies → substack.com
3. Copy the value of `substack.sid` (and `substack.lli` for paid articles)
4. Use as: `substack.sid=YOUR_VALUE; substack.lli=YOUR_LLI_VALUE`

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx -y substack-article-mcp install --cursor` | Log in + add MCP to Cursor |
| `npx -y substack-article-mcp install --claude-code` | Log in + add MCP to Claude Code |
| `npx -y substack-article-mcp login` | Refresh credentials (Chrome login flow) |
| `npx -y substack-article-mcp login --manual '<cookie>'` | Paste cookies directly |
| `npx -y substack-article-mcp login --check` | Check auth status and cookie age |
| `npx -y substack-article-mcp --help` | Show help |
| `npx -y substack-article-mcp --version` | Show version |

> **Do not** run `npx -y substack-article-mcp` with no arguments in your terminal. That starts the MCP stdio server and your terminal will appear stuck. Your AI client starts it automatically.

---

## MCP Tools

| Tool | Auth Required | Description |
|------|:---:|-------------|
| `substack_auth_status` | No | Check auth status, cookie age, and get refresh guidance |
| `list_articles` | No* | List published articles with metadata and engagement stats |
| `get_article` | No* | Full article as markdown. Accepts slug or numeric post ID |
| `search_articles` | No* | Search articles by keyword |
| `get_comments` | No* | Full comment tree with replies and reactions |
| `list_subscriptions` | Yes | All newsletters you subscribe to (paid, comped, free) |
| `get_feed` | Yes | Personalized reader feed from subscribed newsletters |
| `get_inbox` | Yes | Chronological inbox with pagination |

*\* Requires a `subdomain` parameter if not authenticated. Auth is needed for paid/premium content.*

All content tools accept an optional `subdomain` parameter to read any newsletter (e.g., `subdomain: "platformer"`).

`get_article` and `get_comments` also accept numeric post IDs (e.g., `184929446`). When using an ID, the publication is auto-detected.

---

## Privacy & Security

- The server runs **entirely on your local machine** as a subprocess of your AI client
- No cloud hosting, no intermediary servers
- Your credentials never leave your computer
- The `login` command uses a dedicated Chrome profile in `~/.substack-article-mcp/chrome-profile/` — completely separate from your regular Chrome

---

## Requirements

- **Node.js** 18+
- **Google Chrome** (for the `login` / `install` commands only — not needed for Claude Desktop)

## Disclaimer

Uses Substack's internal APIs. Use for personal/experimental purposes. Not affiliated with Substack.

## License

MIT
